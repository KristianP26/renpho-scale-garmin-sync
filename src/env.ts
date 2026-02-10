/**
 * Load .env BEFORE any other module initializes.
 * This must be the first import in index.ts so that noble (which reads
 * env vars at module load time) sees NOBLE_REPORT_ALL_HCI_EVENTS etc.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname: string = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

// On Linux, noble's HCI backend competes with BlueZ for HCI events.
// Without this flag, BlueZ can consume the LE Connection Complete event
// before noble sees it, causing peripheral.connect() to hang indefinitely.
if (!process.env.NOBLE_REPORT_ALL_HCI_EVENTS) {
  process.env.NOBLE_REPORT_ALL_HCI_EVENTS = '1';
}

// On Linux (Raspberry Pi etc.), default to the D-Bus transport so noble
// delegates BLE operations to BlueZ — the same path Python/bleak uses.
// The raw HCI transport can scan while bluetoothd is running, but
// peripheral.connect() hangs because bluetoothd holds exclusive control
// over LE Create Connection commands on the HCI adapter.
// Override with NOBLE_TRANSPORT=hci if bluetoothd is stopped.
if (process.platform === 'linux' && !process.env.NOBLE_TRANSPORT) {
  process.env.NOBLE_TRANSPORT = 'dbus';
}
