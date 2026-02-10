import type { ScaleAdapter, GarminPayload } from '../interfaces/scale-adapter.js';
import type { ScanOptions, ScanResult } from './types.js';

export type { ScanOptions, ScanResult } from './types.js';

/**
 * Scan for a BLE scale, read weight + impedance, and compute body composition.
 *
 * OS detection selects the BLE handler at runtime:
 * - Linux → node-ble (BlueZ D-Bus)
 * - Windows / macOS → noble
 *
 * Dynamic import() ensures the unused library is never loaded.
 */
export async function scanAndRead(opts: ScanOptions): Promise<GarminPayload> {
  if (process.platform === 'linux') {
    const { scanAndRead: impl } = await import('./handler-node-ble.js');
    return impl(opts);
  }
  const { scanAndRead: impl } = await import('./handler-noble.js');
  return impl(opts);
}

/**
 * Scan for nearby BLE devices and identify recognized scales.
 * Uses the OS-appropriate BLE handler.
 */
export async function scanDevices(
  adapters: ScaleAdapter[],
  durationMs?: number,
): Promise<ScanResult[]> {
  if (process.platform === 'linux') {
    const { scanDevices: impl } = await import('./handler-node-ble.js');
    return impl(adapters, durationMs);
  }
  const { scanDevices: impl } = await import('./handler-noble.js');
  return impl(adapters, durationMs);
}
