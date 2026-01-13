import config
import os
from garminconnect import Garmin

# Cesta pre uloženie tokenov
TOKEN_DIR = os.path.expanduser("~/.garmin_renpho_tokens")

# 🥸 Falošná identita (tvárime sa ako Chrome na Macu)
FAKE_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

print(f"🔐 Pripravujem maskovanie a prihlasujem: {config.GARMIN_EMAIL}")

try:
    # 1. Inicializácia
    garmin = Garmin(config.GARMIN_EMAIL, config.GARMIN_PASSWORD)

    # 2. 🔥 APLIKOVANIE MASKY (Toto je ten trik)
    # Prepíšeme hlavičky vnútornej session garth knižnice
    garmin.garth.sess.headers.update({"User-Agent": FAKE_USER_AGENT})

    # 3. Prihlásenie
    print("🚀 Posielam prihlasovacie údaje...")
    garmin.login()

    print("✅ Prihlásenie ÚSPEŠNÉ! Cloudflare sme oklamali.")

    # 4. Uloženie tokenov
    if not os.path.exists(TOKEN_DIR):
        os.makedirs(TOKEN_DIR)

    garmin.garth.dump(TOKEN_DIR)
    print(f"💾 Tokeny uložené do: {TOKEN_DIR}")
    print("Teraz spusti 'scale_sync.py' - už by to malo ísť!")

except Exception as e:
    print("\n❌ STÁLE CHYBA:")
    print(e)
    print("\nAk to stále nejde, Garmin natvrdo zablokoval IP adresu tvojho Raspberry Pi.")
    print("V tom prípade je naozaj jediná cesta spustiť tento skript na inom PC/mobile (cez Termux)")
    print("a skopírovať vygenerovaný priečinok ~/.garmin_renpho_tokens na toto Raspberry.")