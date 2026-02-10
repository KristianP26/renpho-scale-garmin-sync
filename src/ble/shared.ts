import type {
  ScaleAdapter,
  UserProfile,
  ScaleReading,
  GarminPayload,
  ConnectionContext,
} from '../interfaces/scale-adapter.js';
import type { WeightUnit } from '../validate-env.js';
import { LBS_TO_KG, normalizeUuid, bleLog } from './types.js';

// ─── Thin abstractions over BLE library objects ───────────────────────────────

export interface BleChar {
  subscribe(onData: (data: Buffer) => void): Promise<void>;
  write(data: Buffer, withResponse: boolean): Promise<void>;
  read(): Promise<Buffer>;
}

export interface BleDevice {
  onDisconnect(callback: () => void): void;
}

// ─── Shared reading logic ─────────────────────────────────────────────────────

/**
 * Subscribe to GATT notifications and wait for a complete scale reading.
 * Shared by both the node-ble (Linux) and noble (Windows/macOS) handlers.
 */
export function waitForReading(
  charMap: Map<string, BleChar>,
  bleDevice: BleDevice,
  adapter: ScaleAdapter,
  profile: UserProfile,
  weightUnit?: WeightUnit,
  onLiveData?: (reading: ScaleReading) => void,
): Promise<GarminPayload> {
  const resolveChar = (uuid: string): BleChar | undefined => charMap.get(normalizeUuid(uuid));

  return new Promise<GarminPayload>((resolve, reject) => {
    let resolved = false;
    let unlockInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = (): void => {
      if (unlockInterval) {
        clearInterval(unlockInterval);
        unlockInterval = null;
      }
    };

    // Handle unexpected disconnect
    bleDevice.onDisconnect(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('Scale disconnected before reading completed'));
      }
    });

    const handleNotification = (sourceUuid: string, data: Buffer): void => {
      if (resolved) return;

      const reading: ScaleReading | null = adapter.parseCharNotification
        ? adapter.parseCharNotification(sourceUuid, data)
        : adapter.parseNotification(data);
      if (!reading) return;

      if (weightUnit === 'lbs' && !adapter.normalizesWeight) {
        reading.weight *= LBS_TO_KG;
      }

      if (onLiveData) onLiveData(reading);

      if (adapter.isComplete(reading)) {
        resolved = true;
        cleanup();
        // Clear any \r progress line before logging
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        bleLog.info(`Reading complete: ${reading.weight.toFixed(2)} kg / ${reading.impedance} Ohm`);
        try {
          resolve(adapter.computeMetrics(reading, profile));
        } catch (e) {
          reject(e);
        }
      }
    };

    const subscribeAndListen = async (charUuid: string): Promise<void> => {
      const char = resolveChar(charUuid);
      if (!char) throw new Error(`Characteristic ${charUuid} not found`);
      const normalized = normalizeUuid(charUuid);
      await char.subscribe((data: Buffer) => handleNotification(normalized, data));
    };

    const startInit = async (): Promise<void> => {
      if (adapter.onConnected) {
        const ctx: ConnectionContext = {
          profile,
          write: async (charUuid, data, withResponse = true) => {
            const char = resolveChar(charUuid);
            if (!char) throw new Error(`Characteristic ${charUuid} not found`);
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            await char.write(buf, withResponse);
          },
          read: async (charUuid) => {
            const char = resolveChar(charUuid);
            if (!char) throw new Error(`Characteristic ${charUuid} not found`);
            return char.read();
          },
          subscribe: async (charUuid) => {
            await subscribeAndListen(charUuid);
          },
        };
        bleLog.debug('Calling adapter.onConnected()');
        await adapter.onConnected(ctx);
        bleLog.debug('adapter.onConnected() completed');
      } else {
        // Legacy unlock command interval
        const writeChar =
          resolveChar(adapter.charWriteUuid) ??
          (adapter.altCharWriteUuid ? resolveChar(adapter.altCharWriteUuid) : undefined);
        if (!writeChar) return;

        const unlockBuf = Buffer.from(adapter.unlockCommand);
        const sendUnlock = async (): Promise<void> => {
          if (resolved) return;
          try {
            await writeChar.write(unlockBuf, false);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!resolved) bleLog.error(`Unlock write error: ${msg}`);
          }
        };

        sendUnlock();
        unlockInterval = setInterval(() => void sendUnlock(), adapter.unlockIntervalMs);
      }
    };

    // Subscribe to notifications and start adapter init
    (async () => {
      try {
        if (adapter.characteristics) {
          // Multi-char mode
          bleLog.debug(`Multi-char mode: ${adapter.characteristics.length} bindings`);
          const notifyBindings = adapter.characteristics.filter((b) => b.type === 'notify');

          if (notifyBindings.length === 0) {
            throw new Error(
              `No notify characteristics in adapter bindings. Discovered: [${[...charMap.keys()].join(', ')}]`,
            );
          }

          for (const binding of notifyBindings) {
            await subscribeAndListen(binding.uuid);
          }
          bleLog.info(`Subscribed to ${notifyBindings.length} notification(s). Step on the scale.`);
          await startInit();
        } else {
          // Legacy mode — single notify + write pair
          bleLog.debug(
            `Looking for notify=${adapter.charNotifyUuid}` +
              (adapter.altCharNotifyUuid ? ` (alt=${adapter.altCharNotifyUuid})` : '') +
              `, write=${adapter.charWriteUuid}` +
              (adapter.altCharWriteUuid ? ` (alt=${adapter.altCharWriteUuid})` : ''),
          );

          const notifyChar =
            resolveChar(adapter.charNotifyUuid) ??
            (adapter.altCharNotifyUuid ? resolveChar(adapter.altCharNotifyUuid) : undefined);
          const writeChar =
            resolveChar(adapter.charWriteUuid) ??
            (adapter.altCharWriteUuid ? resolveChar(adapter.altCharWriteUuid) : undefined);

          if (!notifyChar || !writeChar) {
            throw new Error(
              `Required characteristics not found. ` +
                `Notify (${adapter.charNotifyUuid}): ${!!notifyChar}, ` +
                `Write (${adapter.charWriteUuid}): ${!!writeChar}. ` +
                `Discovered: [${[...charMap.keys()].join(', ')}]`,
            );
          }

          const effectiveNotifyUuid = resolveChar(adapter.charNotifyUuid)
            ? adapter.charNotifyUuid
            : adapter.altCharNotifyUuid!;
          // Legacy mode — subscribe + first unlock in parallel to prevent
          // the scale from disconnecting before receiving the unlock command
          await Promise.all([subscribeAndListen(effectiveNotifyUuid), startInit()]);
          bleLog.info('Subscribed to notifications. Step on the scale.');
        }
      } catch (e) {
        if (!resolved) {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    })();
  });
}
