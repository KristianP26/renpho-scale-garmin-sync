# ⚖️ BLE Scale Sync

> **Work in Progress** — Under active development. Expect breaking changes.

**Step on your scale. Data lands in Garmin Connect. Done.**

A cross-platform CLI tool that captures body composition data from any BLE smart scale and exports it to multiple targets. The killer feature is direct **Garmin Connect upload** — no phone app, no manual entry, no overpriced Garmin Index scale. A $30 BLE scale + Raspberry Pi is all you need.

23 scale adapters · Linux / macOS / Windows · Garmin Connect + MQTT · 10 body composition metrics

---

## Motivation

Garmin's Index S2 (~$150) has Wi-Fi connectivity issues and inconsistent readings. A $30 BLE scale has better hardware but no Garmin integration. The only workflow: phone app → wait for sync → manually type numbers into Garmin. Every single time.

This project eliminates that. A **Raspberry Pi Zero 2W** sits next to the scale, always listening. Step on, wait a few seconds, done — the reading appears in Garmin Connect automatically.

---

## ✨ Features

| | |
|---|---|
| **Garmin Connect** | Direct upload — the only open-source BLE-to-Garmin bridge without a phone |
| **MQTT** | Publish to Home Assistant, Node-RED, Grafana, or any broker |
| **23 adapters** | Auto-detects scale brand via BLE advertisement |
| **10 metrics** | Weight, BMI, body fat %, water %, bone mass, muscle mass, visceral fat, physique rating, BMR, metabolic age |
| **Cross-platform** | Linux (Raspberry Pi), macOS, Windows |
| **Auto-discovery** | Zero config — just step on the scale |
| **Modular exports** | Run multiple exporters in parallel, easy to extend |
| **Athlete mode** | Adjusted BIA formulas for active users |

---

## Architecture

```
                                          ┌───────────────────┐
                                   ┌────> │  Garmin Connect   │
┌──────────────┐    ┌────────────┐ │      └───────────────────┘
│  BLE Scale   │    │ TypeScript │ │      ┌───────────────────┐
│  (Bluetooth) │ ─> │ BLE + Body │ ├────> │   MQTT Broker     │
└──────────────┘    │ Composition│ │      └───────────────────┘
                    └────────────┘ │      ┌───────────────────┐
                                   └────> │  Future exports…  │
                                          └───────────────────┘
```

1. TypeScript scans for a BLE scale using the OS-appropriate handler
2. Auto-detects the brand via adapter pattern, reads weight + impedance
3. Calculates 10 body composition metrics (BIA formulas)
4. Dispatches results in parallel to all enabled exporters

---

## 📡 Supported Scales

| Brand / Model | Protocol |
|---|---|
| **QN-Scale** / Renpho / Senssun / Sencor | Custom (FFE0 / FFF0) |
| **Renpho** ES-WBE28 | Vendor BCS/WSS |
| **Renpho** ES-26BB | Custom (1A10) |
| **Xiaomi Mi Scale 2** (MIBCS / MIBFS) | Vendor UUID |
| **Yunmai** Signal / Mini / SE | Custom (FFE0) |
| **Beurer** BF700 / BF710 / BF800 | Custom (FFE0) |
| **Sanitas** SBF70 / SBF75 / SBF72 / SBF73 | Custom (FFE0) / BCS |
| **Beurer** BF915 | Standard BCS |
| **Soehnle** Shape200 / Shape100 / Shape50 / Style100 | Custom UUID |
| **Medisana** BS430 / BS440 / BS444 | Custom (78B2) |
| **Trisa** Body Analyze | Custom (7802) |
| **Excelvan** CF369 (Electronic Scale) | Custom (FFF0) |
| **Hesley** (YunChen) | Custom (FFF0) |
| **Inlife** (fatscale) | Custom (FFF0) |
| **Digoo** DG-SO38H (Mengii) | Custom (FFF0) |
| **Senssun Fat** | Custom (FFF0) |
| **ES-CS20M** | Custom (1A10) |
| **Exingtech Y1** (vscale) | Custom UUID |
| **1byone** / Eufy C1 / Eufy P1 | Custom (FFF0 / FFB0) |
| **Active Era** BS-06 | Custom (FFB0) |
| **MGB** (Swan / Icomon / YG) | Custom (FFB0) |
| **Hoffen** BS-8107 | Custom (FFB0) |
| Any **standard BT SIG BCS/WSS** scale | Standard (181B / 181D) |

Don't see yours? Try `npm run scan` — the Standard GATT catch-all adapter may still work.

---

## Prerequisites

**All platforms:** [Node.js](https://nodejs.org/) v20+ · [Python](https://python.org/) 3.9+ (for Garmin upload) · BLE adapter

<details>
<summary>🐧 Linux (Debian / Ubuntu / Raspberry Pi OS)</summary>

```bash
sudo apt-get update
sudo apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev build-essential python3-pip

# Node.js v20 (skip if already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Allow BLE access without root
sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))
```

</details>

<details>
<summary>🍎 macOS</summary>

```bash
xcode-select --install
brew install node@20
```

No additional Bluetooth setup — macOS uses CoreBluetooth natively.

</details>

<details>
<summary>🪟 Windows</summary>

1. [Node.js](https://nodejs.org/) v20+ LTS (check "Add to PATH")
2. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) ("Desktop development with C++")
3. [Python](https://python.org/) (check "Add to PATH")
4. BLE adapter with [WinUSB driver](https://zadig.akeo.ie/) — see [noble Windows guide](https://github.com/abandonware/noble#windows)

</details>

---

## Installation

```bash
git clone https://github.com/KristianP26/blescalesync.git
cd blescalesync

npm install

# Python venv (for Garmin upload)
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

> Modern Linux distros (Debian 12+, Ubuntu 23.04+, Raspberry Pi OS Bookworm) require a venv for pip.

---

## ⚙️ Configuration

### 1. Environment

```bash
cp .env.example .env
```

```ini
GARMIN_EMAIL=you@example.com
GARMIN_PASSWORD=your_password

USER_HEIGHT=183
USER_BIRTH_DATE=2000-06-15
USER_GENDER=male
USER_IS_ATHLETE=true

# Optional (defaults to metric)
WEIGHT_UNIT=kg
HEIGHT_UNIT=cm
```

### 2. Scale discovery (optional)

```bash
npm run scan
```

Scans for 15 seconds. Recognized scales are tagged (`[QN Scale]`, `[Mi Scale 2]`, etc.). Set `SCALE_MAC` in `.env` to lock to a specific device:

```ini
SCALE_MAC=FF:03:00:13:A1:04
```

> **Recommended** — BLE signals pass through walls. Without `SCALE_MAC`, you might connect to a neighbor's scale.
>
> On macOS, use the CoreBluetooth UUID from `npm run scan` instead of a MAC address.

### 3. Garmin authentication

```bash
npm run setup-garmin
```

One-time login. Tokens are saved to `~/.garmin_tokens/` and reused automatically.

> If auth fails, Garmin may be blocking your IP (VPN/cloud). Try from a different network, then copy `~/.garmin_tokens/` to the target machine.

### 4. Exporters (optional)

```ini
EXPORTERS=garmin              # default
EXPORTERS=garmin,mqtt         # both in parallel
EXPORTERS=mqtt                # MQTT only
```

All exporters run in parallel. The app fails only if **all** exporters fail.

#### MQTT

Publishes the full body composition payload as JSON.

**Home Assistant auto-discovery** is enabled by default — all 11 metrics appear as sensors grouped under a single "BLE Scale" device, no YAML needed.

```ini
MQTT_BROKER_URL=mqtt://localhost:1883
# MQTT_TOPIC=scale/body-composition
# MQTT_QOS=1
# MQTT_RETAIN=true
# MQTT_USERNAME=
# MQTT_PASSWORD=
# MQTT_CLIENT_ID=ble-scale-sync
# MQTT_HA_DISCOVERY=true
```

| Variable | Default | Description |
|---|---|---|
| `MQTT_BROKER_URL` | *required* | `mqtt://host:1883` |
| `MQTT_TOPIC` | `scale/body-composition` | Publish topic |
| `MQTT_QOS` | `1` | QoS level (0, 1, 2) |
| `MQTT_RETAIN` | `true` | Retain last message |
| `MQTT_USERNAME` | — | Broker auth |
| `MQTT_PASSWORD` | — | Broker auth |
| `MQTT_CLIENT_ID` | `ble-scale-sync` | Client identifier |
| `MQTT_HA_DISCOVERY` | `true` | HA auto-discovery configs |

---

## Usage

```bash
npm start                                 # Scan → read → export
DRY_RUN=true npm start                    # Read only, skip exports
DEBUG=true npm start                      # Verbose BLE logging
```

```powershell
# Windows PowerShell
$env:DRY_RUN="true"; npm start
$env:DEBUG="true"; npm start
```

---

## 🧮 Body Composition

| Metric | Unit | Formula |
|---|---|---|
| Weight | kg | Raw scale reading |
| BMI | — | `weight / (height_m)²` |
| Body Fat | % | BIA: `LBM = c1·(H²/Z) + c2·W + c3·A + c4` |
| Water | % | `LBM × 0.73 / W × 100` (athlete: 0.74) |
| Bone Mass | kg | `LBM × 0.042` |
| Muscle Mass | kg | `LBM × 0.54` (athlete: 0.60) |
| Visceral Fat | 1–59 | `BF% × 0.55 − 4 + age × 0.08` |
| Physique Rating | 1–9 | Based on BF% and muscle/weight ratio |
| BMR | kcal | Mifflin-St Jeor: `10W + 6.25H − 5A + s` (athlete: +5%) |
| Metabolic Age | years | `age + (idealBMR − BMR) / 15` |

<details>
<summary>BIA coefficients & fallbacks</summary>

| | c1 | c2 | c3 | c4 |
|---|---|---|---|---|
| Male | 0.503 | 0.165 | −0.158 | 17.8 |
| Male (athlete) | 0.637 | 0.205 | −0.180 | 12.5 |
| Female | 0.490 | 0.150 | −0.130 | 11.5 |
| Female (athlete) | 0.550 | 0.180 | −0.150 | 8.5 |

Without impedance, body fat falls back to Deurenberg:
`BF% = 1.2 × BMI + 0.23 × age − 10.8 × sex − 5.4` (sex: 1=male, 0=female; athlete: ×0.85)

Mi Scale 2 and Yunmai use the scale's pre-computed values directly.

</details>

**Athlete mode** (`USER_IS_ATHLETE=true`) increases LBM coefficients, water ratio (74% vs 73%), muscle ratio (60% vs 54%), BMR (+5%), and caps metabolic age at actual age − 5.

---

## 🛠 Development

```bash
npm test                                   # 500+ tests (Vitest)
npx vitest run tests/calculator.test.ts    # Single file
npm run lint                               # ESLint
npm run format:check                       # Prettier check
```

### Project structure

```
blescalesync/
├── src/
│   ├── index.ts                 # Orchestrator
│   ├── ble/                     # BLE layer (OS-specific handlers)
│   ├── exporters/               # Garmin, MQTT, registry, config
│   ├── scales/                  # 23 scale adapters + shared helpers
│   ├── interfaces/              # ScaleAdapter, Exporter, types
│   ├── calculator.ts            # Body composition math
│   └── validate-env.ts          # .env validation
├── tests/                       # 500+ tests
├── garmin-scripts/              # Python (Garmin upload + setup)
└── .env.example
```

### Adding a new scale

1. `src/scales/your-brand.ts` — implement `ScaleAdapter`
2. `src/scales/index.ts` — register (before Standard GATT catch-all)
3. `tests/scales/` — add tests

### Adding a new exporter

1. `src/exporters/your-exporter.ts` — implement `Exporter`
2. `src/exporters/config.ts` — add to `ExporterName` type + env parsing
3. `src/exporters/index.ts` — add case in `createExporters()`
4. `tests/exporters/` — add tests
5. `.env.example` — document config

---

## Troubleshooting

<details>
<summary>"Permission denied" on Linux</summary>

```bash
sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))
```

</details>

<details>
<summary>Scale not found</summary>

- Step on the scale to wake it up
- Verify `SCALE_MAC` matches (`npm run scan`)
- Linux: `sudo systemctl start bluetooth`
- Auto-discovery works without `SCALE_MAC` on all platforms

</details>

<details>
<summary>Connection errors on Raspberry Pi</summary>

The app stops discovery before connecting. If `le-connection-abort-by-local` persists:

```bash
sudo systemctl restart bluetooth
```

</details>

<details>
<summary>Garmin upload fails</summary>

- Re-run `npm run setup-garmin`
- Check `.env` credentials
- Try from a non-VPN network

</details>

<details>
<summary>Windows BLE issues</summary>

- BLE adapter must use [WinUSB driver](https://zadig.akeo.ie/)
- Run terminal as Administrator if needed

</details>

---

## 💡 Recommended Setup

| | |
|---|---|
| **Hardware** | [Raspberry Pi Zero 2W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/) — $15, built-in BLE, ~0.4W idle |
| **Scale** | Any supported BLE scale |
| **OS** | Raspberry Pi OS Lite (headless) |

---

## Credits

**Scale protocols** — Ported from [openScale](https://github.com/oliexdev/openScale) (oliexdev). All 23 adapters cross-referenced against the Java/Kotlin source.

**Garmin Connect** — [garminconnect](https://github.com/cyberjunky/python-garminconnect) (cyberjunky).

**Formulas** — BIA (Lukaski 1986), Mifflin-St Jeor (1990), Deurenberg (1991).

## License

GPL-3.0 — see [LICENSE](LICENSE).
