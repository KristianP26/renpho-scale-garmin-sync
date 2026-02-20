#!/usr/bin/env python3
"""Capture a screenshot from the ESP32 display via MQTT.

Usage:
    python3 firmware/tools/capture_screenshot.py [output.png]

Triggers a screenshot, receives RGB565 data over MQTT, converts to PNG.
"""

import sys
import struct
import subprocess
import tempfile
import time

BROKER = "10.1.1.15"
BASE = "ble-proxy/esp32-ble-proxy"
OUTPUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/screenshot.png"

W, H = 480, 480
EXPECTED_SIZE = W * H * 2  # RGB565


def main():
    import paho.mqtt.client as mqtt

    chunks = {}
    info = {}
    done = False

    def on_message(client, userdata, msg):
        nonlocal done, info
        t = msg.topic
        if t == f"{BASE}/screenshot/info":
            import json
            info = json.loads(msg.payload)
            print(f"Screenshot info: {info}")
        elif t == f"{BASE}/screenshot/done":
            done = True
        elif t.startswith(f"{BASE}/screenshot/"):
            idx = int(t.split("/")[-1])
            chunks[idx] = msg.payload

    client = mqtt.Client()
    client.on_message = on_message
    client.connect(BROKER)
    client.subscribe(f"{BASE}/screenshot/#")
    client.loop_start()

    # Trigger screenshot
    time.sleep(0.5)
    client.publish(f"{BASE}/screenshot", "")
    print("Screenshot triggered, waiting for data...")

    # Wait for all chunks
    timeout = time.time() + 30
    while not done and time.time() < timeout:
        time.sleep(0.1)

    client.loop_stop()
    client.disconnect()

    if not done:
        print("Timeout waiting for screenshot data")
        sys.exit(1)

    n_chunks = info.get("chunks", len(chunks))
    print(f"Received {len(chunks)}/{n_chunks} chunks")

    # Reassemble
    raw = b""
    for i in range(n_chunks):
        if i not in chunks:
            print(f"Missing chunk {i}")
            sys.exit(1)
        raw += chunks[i]

    print(f"Total size: {len(raw)} bytes (expected {EXPECTED_SIZE})")

    # Convert RGB565 to RGB888 PNG
    pixels = []
    for i in range(0, len(raw), 2):
        v = struct.unpack("<H", raw[i:i+2])[0]
        r = ((v >> 11) & 0x1F) << 3
        g = ((v >> 5) & 0x3F) << 2
        b = (v & 0x1F) << 3
        pixels.extend([r, g, b])

    from PIL import Image
    img = Image.frombytes("RGB", (W, H), bytes(pixels))
    img.save(OUTPUT)
    print(f"Saved to {OUTPUT}")


if __name__ == "__main__":
    main()
