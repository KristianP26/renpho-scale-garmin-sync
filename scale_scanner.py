import asyncio
import sys
from bleak import BleakClient
import config


class RenphoCalculator:
    def __init__(self, weight, impedance, height, age, gender, is_athlete=False):
        self.weight = weight
        self.impedance = impedance
        self.height = height
        self.age = age
        self.gender = gender
        self.is_athlete = is_athlete

    def calculate(self):
        if self.height == 0 or self.weight == 0 or self.impedance == 0:
            return None

        # --- 1. LBM (Lean Body Mass) ---
        if self.gender == 'male':
            if self.is_athlete:
                const_1, const_2, const_3, const_4 = 0.637, 0.205, -0.180, 12.5
            else:
                const_1, const_2, const_3, const_4 = 0.503, 0.165, -0.158, 17.8
        else:
            if self.is_athlete:
                const_1, const_2, const_3, const_4 = 0.550, 0.180, -0.150, 8.5
            else:
                const_1, const_2, const_3, const_4 = 0.490, 0.150, -0.130, 11.5

        h2_r = (self.height ** 2) / self.impedance
        lbm = (const_1 * h2_r) + (const_2 * self.weight) + (const_3 * self.age) + const_4

        if lbm > self.weight: lbm = self.weight * 0.96

        # --- 2. Metrics Calculation ---
        body_fat_kg = self.weight - lbm
        body_fat_percent = max(3.0, min((body_fat_kg / self.weight) * 100, 60.0))

        water_coeff = 0.74 if self.is_athlete else 0.73
        water_percent = (lbm * water_coeff / self.weight) * 100

        bone_mass = lbm * 0.042
        muscle_mass = lbm - bone_mass

        height_m = self.height / 100.0
        bmi = self.weight / (height_m * height_m)

        # BMR & Metabolic Age
        base_bmr = (10 * self.weight) + (6.25 * self.height) - (5 * self.age)
        offset = 5 if self.gender == 'male' else -161
        bmr = base_bmr + offset
        if self.is_athlete: bmr *= 1.05

        ideal_bmr = (10 * self.weight) + (6.25 * self.height) - (5 * 25) + 5
        metabolic_age = self.age + int((ideal_bmr - bmr) / 15)
        if metabolic_age < 12: metabolic_age = 12
        if self.is_athlete and metabolic_age > self.age: metabolic_age = self.age - 2

        return {
            "BMI": round(bmi, 2),
            "Body Fat (%)": round(body_fat_percent, 2),
            "LBM (kg)": round(lbm, 2),
            "Water (%)": round(water_percent, 2),
            "Muscle Mass (kg)": round(muscle_mass, 2),
            "Bone Mass (kg)": round(bone_mass, 2),
            "BMR (kcal)": int(bmr),
            "Metabolic Age": int(metabolic_age)
        }


# ==========================================
# 🧬 MAIN LOGIC
# ==========================================
final_result_processed = False


def handle_data(handle, data):
    global final_result_processed

    if data[0] != 0x10 or len(data) < 10: return

    weight_kg = ((data[3] << 8) + data[4]) / 100.0
    impedance = (data[8] << 8) + data[9]

    if not final_result_processed:
        imp_status = f"{impedance} Ohm" if impedance > 0 else "Measuring..."
        sys.stdout.write(f"\r⚖️  Weight: {weight_kg:6.2f} kg | Impedance: {imp_status:12}")
        sys.stdout.flush()

    if weight_kg > 10.0 and impedance > 200 and not final_result_processed:
        print("\n\n✨ DATA RECEIVED! ✨")
        print("=" * 40)

        calc = RenphoCalculator(weight_kg, impedance, config.USER_HEIGHT, config.USER_AGE, config.USER_GENDER,
                                config.USER_IS_ATHLETE)
        metrics = calc.calculate()

        mode_str = "ATHLETE" if config.USER_IS_ATHLETE else "NORMAL"
        print(f"👤 User: {config.USER_GENDER}, {config.USER_AGE}y, {config.USER_HEIGHT}cm ({mode_str})")
        print(f"⚖️  WEIGHT:    {weight_kg} kg")
        print(f"⚡ IMPEDANCE: {impedance} Ohm")
        print("-" * 40)

        if metrics:
            for k, v in metrics.items(): print(f"📊 {k:18}: {v}")
        else:
            print("❌ Calculation Error")

        print("=" * 40)
        final_result_processed = True


async def main():
    print(f"Connecting to {config.SCALE_MAC}...")
    try:
        async with BleakClient(config.SCALE_MAC) as client:
            print("✅ Connected! Step on scale.")
            await client.start_notify(config.CHAR_NOTIFY, handle_data)

            while client.is_connected and not final_result_processed:
                # Using command from CONFIG now
                await client.write_gatt_char(config.CHAR_WRITE, config.CMD_UNLOCK)
                await asyncio.sleep(2.0)

            print("👋 Done.")
    except Exception as e:
        print(f"\nError: {e}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAborted.")