#!/usr/bin/env tsx

// Load .env FIRST — before any other module initializes
import './env.js';

import { scanAndRead } from './ble/index.js';
import { abortableSleep } from './ble/types.js';
import { adapters } from './scales/index.js';
import { loadConfig } from './validate-env.js';
import { createLogger } from './logger.js';
import { errMsg } from './utils/error.js';
import { loadExporterConfig, createExporters } from './exporters/index.js';
import { runHealthchecks, dispatchExports } from './orchestrator.js';
import type { Exporter } from './interfaces/exporter.js';
import type { BodyComposition } from './interfaces/scale-adapter.js';

const log = createLogger('Sync');

const {
  profile,
  scaleMac: SCALE_MAC,
  weightUnit,
  dryRun,
  continuousMode,
  scanCooldownSec,
} = loadConfig();

const KG_TO_LBS = 2.20462;

function fmtWeight(kg: number): string {
  if (weightUnit === 'lbs') return `${(kg * KG_TO_LBS).toFixed(2)} lbs`;
  return `${kg.toFixed(2)} kg`;
}

// ─── Abort / signal handling ─────────────────────────────────────────────────

const ac = new AbortController();
const { signal } = ac;
let forceExitOnNext = false;

function onSignal(): void {
  if (forceExitOnNext) {
    log.info('Force exit.');
    process.exit(1);
  }
  forceExitOnNext = true;
  log.info('\nShutting down gracefully... (press again to force exit)');
  ac.abort();
}

process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

// ─── Single cycle ────────────────────────────────────────────────────────────

async function runCycle(exporters?: Exporter[]): Promise<boolean> {
  const payload: BodyComposition = await scanAndRead({
    targetMac: SCALE_MAC,
    adapters,
    profile,
    weightUnit,
    abortSignal: signal,
    onLiveData(reading) {
      const impStr: string = reading.impedance > 0 ? `${reading.impedance} Ohm` : 'Measuring...';
      process.stdout.write(`\r  Weight: ${fmtWeight(reading.weight)} | Impedance: ${impStr}      `);
    },
  });

  log.info(`\nMeasurement received: ${fmtWeight(payload.weight)} / ${payload.impedance} Ohm`);
  log.info('Body composition:');
  const kgMetrics = new Set(['boneMass', 'muscleMass']);
  const { weight: _w, impedance: _i, ...metrics } = payload;
  for (const [k, v] of Object.entries(metrics)) {
    const display = kgMetrics.has(k) ? fmtWeight(v) : String(v);
    log.info(`  ${k}: ${display}`);
  }

  if (!exporters) {
    log.info('\nDry run — skipping export.');
    return true;
  }

  return dispatchExports(exporters, payload);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const modeLabel = continuousMode ? ' (continuous)' : '';
  log.info(`\nBLE Scale Sync${dryRun ? ' (dry run)' : ''}${modeLabel}`);
  if (SCALE_MAC) {
    log.info(`Scanning for scale ${SCALE_MAC}...`);
  } else {
    log.info(`Scanning for any recognized scale...`);
  }
  log.info(`Adapters: ${adapters.map((a) => a.name).join(', ')}\n`);

  let exporters: Exporter[] | undefined;
  if (!dryRun) {
    const exporterConfig = loadExporterConfig();
    exporters = createExporters(exporterConfig);
    await runHealthchecks(exporters);
  }

  if (!continuousMode) {
    const success = await runCycle(exporters);
    if (!success) process.exit(1);
    return;
  }

  // Continuous mode loop
  while (!signal.aborted) {
    try {
      await runCycle(exporters);

      // Cooldown only after a successful reading — the discovery timeout
      // (120s) already acts as the waiting period between retry attempts
      if (signal.aborted) break;
      log.info(`\nWaiting ${scanCooldownSec}s before next scan...`);
      await abortableSleep(scanCooldownSec * 1000, signal);
    } catch (err) {
      if (signal.aborted) break;
      log.info(`No scale found, retrying... (${errMsg(err)})`);
    }
  }

  log.info('Stopped.');
}

main().catch((err: Error) => {
  if (signal.aborted) {
    log.info('Stopped.');
    return;
  }
  log.error(err.message);
  process.exit(1);
});
