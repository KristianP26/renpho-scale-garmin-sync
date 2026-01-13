import asyncio
import sys
from bleak import BleakClient
from garminconnect import Garmin
import config
from scale_scanner import RenphoCalculator

# Flag to stop the loop once data is synced
sync_completed = False


def upload_to_garmin(metrics, weight):
    print(f"\n☁️  Connecting to Garmin Connect ({config.GARMIN_EMAIL})...")

    try:
        # 1. Login
        garmin = Garmin(config.GARMIN_EMAIL, config.GARMIN_PASSWORD)
        garmin.login()

        print("🚀 Uploading data...")

        # 2. Upload
        # We map our calculated metrics to Garmin's API parameters
        garmin.add_body_composition(
            timestamp=None,  # Uses current time
            weight=weight,
            percent_fat=metrics["Body Fat (%)"],
            percent_hydration=metrics["Water (%)"],
            bone_mass=metrics["Bone Mass (kg)"],
            muscle_mass=metrics["Muscle Mass (kg)"],
            visceral_fat_rating=None,
            physique_rating=None,
            metabolic_age=metrics["Metabolic Age"],
            body_mass_index=metrics["BMI"]
        )

        print("✅ SUCCESS! Data synced to Garmin Connect.")
        return True

    except Exception as e:
        print(f"❌ Garmin Upload Error: {e}")
        return False


def handle_data_and_sync(handle, data):
    global sync_completed

    # Filter data (only packet 0x10)
    if data[0] != 0x10 or len(data) < 10: return

    # Parse raw data
    weight_kg = ((data[3] << 8) + data[4]) / 100.0
    impedance = (data[8] << 8) + data[9]

    # Show live status
    if not sync_completed:
        imp_status = f"{impedance} Ohm" if impedance > 0 else "Measuring..."
        sys.stdout.write(f"\r⚖️  Weight: {weight_kg:6.2f} kg | Impedance: {imp_status:12}")
        sys.stdout.flush()

    # Finalize if data is valid and stable (impedance > 200 checks for barefoot contact)
    if weight_kg > 10.0 and impedance > 200 and not sync_completed:
        print("\n\n✨ MEASUREMENT COMPLETE! CALCULATING... ✨")

        # Use the calculator class from scale_scanner.py
        calc = RenphoCalculator(
            weight_kg, impedance,
            config.USER_HEIGHT, config.USER_AGE, config.USER_GENDER, config.USER_IS_ATHLETE
        )
        metrics = calc.calculate()

        if metrics:
            print(f"📊 Body Fat: {metrics['Body Fat (%)']}% | Muscle: {metrics['Muscle Mass (kg)']}kg")

            # Trigger Upload
            success = upload_to_garmin(metrics, weight_kg)
            if success:
                sync_completed = True
        else:
            print("❌ Calculation Error. Check your config data.")


async def main():
    print(f"🔍 Searching for scale {config.SCALE_MAC}...")
    try:
        async with BleakClient(config.SCALE_MAC) as client:
            print("✅ Connected! Step on scale.")
            await client.start_notify(config.CHAR_NOTIFY, handle_data_and_sync)

            # Keep alive loop until sync is done
            while client.is_connected and not sync_completed:
                await client.write_gatt_char(config.CHAR_WRITE, config.CMD_UNLOCK)
                await asyncio.sleep(2.0)

            print("👋 Disconnecting...")

    except Exception as e:
        print(f"\nBluetooth Error: {e}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAborted.")