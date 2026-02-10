import { scanDevices } from './ble/index.js';
import type { ScanResult } from './ble/index.js';
import { adapters } from './scales/index.js';

async function main(): Promise<void> {
  console.log('Scanning for BLE devices... (15 seconds)\n');

  const results: ScanResult[] = await scanDevices(adapters, 15_000);
  const recognized = results.filter((r) => r.matchedAdapter);

  for (const r of results) {
    const tag = r.matchedAdapter ? ` << ${r.matchedAdapter}` : '';
    console.log(`  ${r.address}  Name: ${r.name}${tag}`);
  }

  console.log(`\nDone. Found ${results.length} device(s).`);

  if (recognized.length === 0) {
    console.log('\nNo recognized scales found. Make sure your scale is powered on.');
    console.log('Note: Some scales require SCALE_MAC for identification.');
  } else {
    console.log(`\n--- Recognized scales (${recognized.length}) ---`);
    for (const s of recognized) {
      console.log(`  ${s.address}  ${s.name}  [${s.matchedAdapter}]`);
    }
    console.log('\nTo pin to a specific scale, add to .env:');
    console.log(`  SCALE_MAC=${recognized[0].address}`);
    if (recognized.length === 1) {
      console.log('\nOnly one scale found — auto-discovery will work without SCALE_MAC.');
    }
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
