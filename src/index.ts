#!/usr/bin/env tsx

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { config } from 'dotenv';

import { scanAndRead } from './ble.js';
import { adapters } from './scales/index.js';
import type { Gender, GarminPayload, UserProfile } from './interfaces/scale-adapter.js';

const __dirname: string = dirname(fileURLToPath(import.meta.url));
const ROOT: string = join(__dirname, '..');
config({ path: join(ROOT, '.env') });

interface UploadResult {
  success: boolean;
  data?: Record<string, number>;
  error?: string;
}

function requireEnv(key: string): string {
  const val: string | undefined = process.env[key];
  if (!val) {
    console.error(`Missing required env var: ${key}. Check your .env file.`);
    process.exit(1);
  }
  return val;
}

const SCALE_MAC: string | undefined = process.env.SCALE_MAC || undefined;

const profile: UserProfile = {
  height: Number(requireEnv('USER_HEIGHT')),
  age: Number(requireEnv('USER_AGE')),
  gender: requireEnv('USER_GENDER').toLowerCase() as Gender,
  isAthlete: requireEnv('USER_IS_ATHLETE').toLowerCase() === 'true',
};

async function main(): Promise<void> {
  console.log(`\n[Sync] Renpho Scale → Garmin Connect`);
  if (SCALE_MAC) {
    console.log(`[Sync] Scanning for scale ${SCALE_MAC}...`);
  } else {
    console.log(`[Sync] Scanning for any recognized scale...`);
  }
  console.log(`[Sync] Adapters: ${adapters.map((a) => a.name).join(', ')}\n`);

  const payload: GarminPayload = await scanAndRead({
    targetMac: SCALE_MAC,
    adapters,
    profile,
    onLiveData(reading) {
      const impStr: string = reading.impedance > 0 ? `${reading.impedance} Ohm` : 'Measuring...';
      process.stdout.write(`\r  Weight: ${reading.weight.toFixed(2)} kg | Impedance: ${impStr}      `);
    },
  });

  console.log(`\n\n[Sync] Measurement received: ${payload.weight} kg / ${payload.impedance} Ohm`);
  console.log('[Sync] Body composition:');
  const { weight: _w, impedance: _i, ...metrics } = payload;
  for (const [k, v] of Object.entries(metrics)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log('\n[Sync] Sending to Garmin uploader...');
  const result: UploadResult = await uploadToGarmin(payload);

  if (result.success) {
    console.log('[Sync] Done.');
  } else {
    console.error(`[Sync] Upload failed: ${result.error}`);
    process.exit(1);
  }
}

function uploadToGarmin(payload: GarminPayload): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const scriptPath: string = join(ROOT, 'scripts', 'garmin_upload.py');
    const py = spawn('python', [scriptPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: ROOT,
    });

    const chunks: Buffer[] = [];
    py.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();

    py.on('close', (code: number | null) => {
      const raw: string = Buffer.concat(chunks).toString().trim();
      if (!raw) {
        reject(new Error(`Python uploader exited with code ${code} and no output`));
        return;
      }
      try {
        const result: UploadResult = JSON.parse(raw);
        resolve(result);
      } catch {
        reject(new Error(`Invalid JSON from Python (exit ${code}): ${raw}`));
      }
    });

    py.on('error', (err: Error) => {
      reject(new Error(`Failed to launch Python: ${err.message}`));
    });
  });
}

main().catch((err: Error) => {
  console.error(`\n[Error] ${err.message}`);
  process.exit(1);
});
