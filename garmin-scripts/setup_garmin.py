import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from garminconnect import Garmin

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

FAKE_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)


def get_token_dir(token_dir=None):
    if token_dir:
        return str(Path(token_dir).expanduser())
    custom = os.environ.get("TOKEN_DIR", "").strip()
    if custom:
        return str(Path(custom).expanduser())
    new = Path.home() / ".garmin_tokens"
    old = Path.home() / ".garmin_renpho_tokens"
    if old.is_dir() and not new.is_dir():
        return str(old)
    return str(new)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Setup Garmin Connect authentication"
    )
    parser.add_argument(
        "--email",
        help="Garmin account email (or set GARMIN_EMAIL env var)",
    )
    parser.add_argument(
        "--password",
        help="Garmin account password (or set GARMIN_PASSWORD env var)",
    )
    parser.add_argument(
        "--token-dir",
        help="Directory for storing auth tokens (or set TOKEN_DIR env var, default: ~/.garmin_tokens)",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # Get credentials from CLI args or env vars (CLI args take precedence)
    email = (args.email or os.environ.get("GARMIN_EMAIL", "")).strip()
    password = (args.password or os.environ.get("GARMIN_PASSWORD", "")).strip()

    if not email or not password:
        print(
            "Error: GARMIN_EMAIL and GARMIN_PASSWORD must be provided.\n\n"
            "Usage:\n"
            "  setup_garmin.py --email user@example.com --password mypass\n"
            "  # OR set environment variables:\n"
            "  GARMIN_EMAIL=user@example.com GARMIN_PASSWORD=mypass setup_garmin.py"
        )
        sys.exit(1)

    token_dir = get_token_dir(args.token_dir)
    print(f"[Setup] Authenticating as {email}...")

    try:
        garmin = Garmin(email, password)
        garmin.garth.sess.headers.update({"User-Agent": FAKE_USER_AGENT})

        print("[Setup] Logging in...")
        garmin.login()

        os.makedirs(token_dir, exist_ok=True)
        garmin.garth.dump(token_dir)

        print(f"[Setup] Tokens saved to: {token_dir}")
        print("[Setup] You can now run 'npm start' to sync your scale.")

    except Exception as e:
        print(f"\n[Setup] Authentication failed: {e}")
        print(
            "\nIf Garmin is blocking your IP, try running this setup script "
            "from a different machine or network, then copy the token "
            f"directory ({token_dir}) to this machine."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
