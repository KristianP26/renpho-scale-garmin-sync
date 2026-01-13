import asyncio
import sys
import os
from bleak import BleakClient
from garminconnect import Garmin
import config

# 📂 Cesta k uloženým tokenom
TOKEN_DIR = os.path.expanduser("~/.garmin_renpho_tokens")

# 🥸 Maskovanie
FAKE_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

sync_completed = False


# ==========================================
# 🧠 VYLEPŠENÁ LOGIKA VÝPOČTOV
# ==========================================
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

        # --- 1. LBM (Lean Body Mass - Celková beztuková hmota) ---
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

        # --- 2. Základné metriky ---
        body_fat_kg = self.weight - lbm
        body_fat_percent = max(3.0, min((body_fat_kg / self.weight) * 100, 60.0))

        water_coeff = 0.74 if self.is_athlete else 0.73
        water_percent = (lbm * water_coeff / self.weight) * 100

        bone_mass = lbm * 0.042

        # --- 3. SKELETAL MUSCLE MASS (Kostrové svaly) ---
        # Pôvodne sme mali: muscle_mass = lbm - bone_mass (Toto je Total Lean Soft Tissue)
        # Garmin chce "Skeletal Muscle Mass".
        # Empirický vzorec: Skeletal Muscle je cca 50-60% z LBM v závislosti od trénovanosti.
        # Pre 'Athlete' použijeme vyšší koeficient.
        smm_factor = 0.60 if self.is_athlete else 0.54
        muscle_mass = lbm * smm_factor

        # --- 4. VISCERAL FAT (Odhad 1-59) ---
        # Odhad na základe tuku a veku (Lewington formula approximation)
        # Viscerálny tuk rastie s vekom a % tuku.
        if body_fat_percent > 10:
            visceral_rating = (body_fat_percent * 0.55) - 4 + (self.age * 0.08)
        else:
            visceral_rating = 1

        visceral_rating = max(1, min(int(visceral_rating), 59))

        # --- 5. PHYSIQUE RATING (1-9) ---
        # 1: Hidden Obese, 2: Obese, 3: Solidly Built
        # 4: Under Exercise, 5: Standard, 6: Standard Muscular
        # 7: Thin, 8: Thin Muscular, 9: Very Muscular
        physique_rating = 5  # Default Standard

        if body_fat_percent > 25:  # High Fat
            physique_rating = 2 if muscle_mass > (self.weight * 0.4) else 1
        elif body_fat_percent < 18:  # Low Fat
            if muscle_mass > (self.weight * 0.45):
                physique_rating = 9  # Very Muscular
            elif muscle_mass > (self.weight * 0.4):
                physique_rating = 8  # Thin Muscular
            else:
                physique_rating = 7  # Thin
        else:  # Standard Fat (18-25)
            if muscle_mass > (self.weight * 0.45):
                physique_rating = 6  # Standard Muscular
            elif muscle_mass < (self.weight * 0.38):
                physique_rating = 4  # Under Exercise
            else:
                physique_rating = 5  # Standard

        # --- 6. BMI & BMR ---
        height_m = self.height / 100.0
        bmi = self.weight / (height_m * height_m)

        base_bmr = (10 * self.weight) + (6.25 * self.height) - (5 * self.age)
        offset = 5 if self.gender == 'male' else -161
        bmr = base_bmr + offset
        if self.is_athlete: bmr *= 1.05

        ideal_bmr = (10 * self.weight) + (6.25 * self.height) - (5 * 25) + 5
        metabolic_age = self.age + int((ideal_bmr - bmr) / 15)
        if metabolic_age < 12: metabolic_age = 12
        if self.is_athlete and metabolic_age > self.age: metabolic_age = self.age - 5

        return {
            "BMI": round(bmi, 2),
            "Body Fat (%)": round(body_fat_percent, 2),
            "Water (%)": round(water_percent, 2),
            "Bone Mass (kg)": round(bone_mass, 2),
            "Muscle Mass (kg)": round(muscle_mass, 2),
            "Visceral Fat": int(visceral_rating),
            "Physique Rating": int(physique_rating),
            "BMR (kcal)": int(bmr),
            "Metabolic Age": int(metabolic_age)
        }


# ==========================================
# ☁️ GARMIN LOGIKA
# ==========================================
def get_garmin_client():
    print(f"🔑 Načítavam tokeny z {TOKEN_DIR}...")
    try:
        garmin = Garmin()
        garmin.garth.sess.headers.update({"User-Agent": FAKE_USER_AGENT})
        garmin.login(tokenstore=TOKEN_DIR)
        print("✅ Garmin pripojený.")
        return garmin
    except Exception as e:
        print(f"❌ Chyba tokenov: {e}")
        return None


def upload_to_garmin(metrics, weight):
    garmin = get_garmin_client()
    if not garmin: return False

    print("🚀 Odosielam dáta...")
    try:
        # Pripravíme payload
        garmin.add_body_composition(
            timestamp=None,
            weight=weight,
            percent_fat=metrics["Body Fat (%)"],
            percent_hydration=metrics["Water (%)"],
            bone_mass=metrics["Bone Mass (kg)"],
            muscle_mass=metrics["Muscle Mass (kg)"],
            visceral_fat_rating=metrics["Visceral Fat"],  # ✅ Nové
            physique_rating=metrics["Physique Rating"],  # ✅ Nové
            metabolic_age=metrics["Metabolic Age"],
            bmi=metrics["BMI"]
        )

        print("✅ HOTOVO! Úspešný upload.")
        print(f"   Váha: {weight}kg")
        print(f"   Svaly (Skeletal): {metrics['Muscle Mass (kg)']}kg")
        print(f"   Viscerálny tuk: {metrics['Visceral Fat']}")
        print(f"   Physique Rating: {metrics['Physique Rating']}")
        return True
    except Exception as e:
        print(f"❌ Chyba API: {e}")
        return False


# ==========================================
# ⚖️ MERANIE
# ==========================================
def handle_data_and_sync(handle, data):
    global sync_completed
    if data[0] != 0x10 or len(data) < 10: return

    weight_kg = ((data[3] << 8) + data[4]) / 100.0
    impedance = (data[8] << 8) + data[9]

    if not sync_completed:
        imp_status = f"{impedance} Ω" if impedance > 0 else "Meriam..."
        sys.stdout.write(f"\r⚖️  Váha: {weight_kg:6.2f} kg | Imp: {imp_status:10}")
        sys.stdout.flush()

    if weight_kg > 10.0 and impedance > 200 and not sync_completed:
        print("\n\n✨ DÁTA PRIJATÉ! POČÍTAME... ✨")

        calc = RenphoCalculator(
            weight_kg, impedance,
            config.USER_HEIGHT, config.USER_AGE, config.USER_GENDER, config.USER_IS_ATHLETE
        )
        metrics = calc.calculate()

        if metrics:
            if upload_to_garmin(metrics, weight_kg):
                sync_completed = True
        else:
            print("❌ Chyba výpočtu.")


async def main():
    print(f"🔍 Hľadám váhu {config.SCALE_MAC}...")
    try:
        async with BleakClient(config.SCALE_MAC) as client:
            print("✅ Bluetooth spojené.")
            await client.start_notify(config.CHAR_NOTIFY, handle_data_and_sync)
            while client.is_connected and not sync_completed:
                await client.write_gatt_char(config.CHAR_WRITE, config.CMD_UNLOCK)
                await asyncio.sleep(2.0)
            print("👋 Odpájam.")
    except Exception as e:
        print(f"\nBluetooth Chyba: {e}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nKoniec.")