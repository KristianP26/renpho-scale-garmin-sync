#!/bin/sh
set -e

CMD="${1:-start}"

# Function to extract Garmin users from config.yaml
get_garmin_users() {
    python3 -c "
import yaml
import sys
import re
import os

def resolve_env_ref(value):
    if not isinstance(value, str):
        return value
    # Match \${ENV_VAR} or \$ENV_VAR patterns
    def replacer(match):
        var_name = match.group(1) or match.group(2)
        env_val = os.environ.get(var_name, '')
        return env_val
    # Handle both \${VAR} and \$VAR syntax
    result = re.sub(r'\\\$\{([^}]+)\}|\\\$(\w+)', replacer, value)
    return result

def get_garmin_entries(entries):
    result = []
    for entry in entries:
        if entry.get('type') == 'garmin':
            email = resolve_env_ref(entry.get('email', ''))
            password = resolve_env_ref(entry.get('password', ''))
            token_dir = entry.get('token_dir', '')
            # Expand ~ to home
            if token_dir.startswith('~'):
                home = os.environ.get('HOME', '/home/node')
                token_dir = home + token_dir[1:]
            result.append({
                'email': email,
                'password': password,
                'token_dir': token_dir
            })
    return result

try:
    with open('/app/config.yaml', 'r') as f:
        config = yaml.safe_load(f)
except Exception as e:
    print(f'Error reading config: {e}', file=sys.stderr)
    sys.exit(1)

users = config.get('users', [])
global_exporters = config.get('global_exporters', [])

garmin_users = []

# Check per-user exporters first
for user in users:
    user_exporters = user.get('exporters', [])
    user_garmin = get_garmin_entries(user_exporters)
    if user_garmin:
        garmin_users.append({
            'name': user.get('name', 'Unknown'),
            'entries': user_garmin
        })

# If no per-user Garmin entries, use global exporters for all users
if not garmin_users:
    global_garmin = get_garmin_entries(global_exporters)
    if global_garmin:
        for user in users:
            garmin_users.append({
                'name': user.get('name', 'Unknown'),
                'entries': global_garmin
            })

# Output as simple format: USERNAME|EMAIL|PASSWORD|TOKEN_DIR
for user in garmin_users:
    for entry in user['entries']:
        print(f\"{user['name']}|{entry['email']}|{entry['password']}|{entry['token_dir']}\")
"
}

# Function to setup Garmin for a specific user
setup_garmin_user() {
    local user_name="$1"
    local email="$2"
    local password="$3"
    local token_dir="$4"

    echo "[Setup] Configuring Garmin for user: $user_name"
    python3 garmin-scripts/setup_garmin.py \
        --email "$email" \
        --password "$password" \
        --token-dir "$token_dir"
}

# Function to setup Garmin for all users
setup_garmin_all() {
    local has_error=0

    get_garmin_users | while IFS='|' read -r user_name email password token_dir; do
        echo ""
        echo "[Setup] ==========================================="
        echo "[Setup] Setting up Garmin for user: $user_name"
        echo "[Setup] ==========================================="

        if [ -z "$email" ] || [ -z "$password" ]; then
            echo "[Setup] Warning: Missing email or password for user $user_name"
            has_error=1
            continue
        fi

        # Use default token_dir if not specified
        if [ -z "$token_dir" ]; then
            token_dir="/home/node/.garmin_tokens"
        fi

        if ! setup_garmin_user "$user_name" "$email" "$password" "$token_dir"; then
            echo "[Setup] Failed to setup Garmin for user: $user_name"
            has_error=1
        fi
    done

    return $has_error
}

# Function to setup Garmin for a specific user by name
setup_garmin_for_user() {
    local target_user="$1"
    local found=0

    get_garmin_users | while IFS='|' read -r user_name email password token_dir; do
        if [ "$user_name" = "$target_user" ]; then
            found=1
            echo "[Setup] Setting up Garmin for user: $user_name"

            if [ -z "$email" ] || [ -z "$password" ]; then
                echo "[Setup] Error: Missing email or password for user $user_name"
                exit 1
            fi

            # Use default token_dir if not specified
            if [ -z "$token_dir" ]; then
                token_dir="/home/node/.garmin_tokens"
            fi

            setup_garmin_user "$user_name" "$email" "$password" "$token_dir"
            return $?
        fi
    done

    if [ "$found" -eq 0 ]; then
        echo "[Setup] Error: User '$target_user' not found in config or has no Garmin exporter"
        exit 1
    fi
}

case "$CMD" in
  start)
    exec npx tsx src/index.ts
    ;;
  setup)
    exec npx tsx src/wizard/index.ts
    ;;
  scan)
    exec npx tsx src/scan.ts
    ;;
  validate)
    exec npx tsx src/config/validate-cli.ts
    ;;
  setup-garmin)
    # Parse additional arguments for setup-garmin
    shift  # Remove 'setup-garmin' from args

    if [ $# -eq 0 ]; then
        # No additional args - use legacy behavior with env vars
        exec python3 garmin-scripts/setup_garmin.py
    elif [ "$1" = "--all-users" ]; then
        setup_garmin_all
    elif [ "$1" = "--user" ] && [ -n "$2" ]; then
        setup_garmin_for_user "$2"
    else
        # Pass through any other arguments to the Python script
        exec python3 garmin-scripts/setup_garmin.py "$@"
    fi
    ;;
  help|--help|-h)
    echo "BLE Scale Sync — Docker Commands"
    echo ""
    echo "Usage: docker run [options] ghcr.io/kristianp26/ble-scale-sync [command]"
    echo ""
    echo "Commands:"
    echo "  start                    Run the main sync flow (default)"
    echo "  setup                    Interactive setup wizard"
    echo "  scan                     Discover nearby BLE devices"
    echo "  validate                 Validate config.yaml"
    echo "  setup-garmin             Setup Garmin authentication"
    echo "    setup-garmin --user <username>    Setup for specific user"
    echo "    setup-garmin --all-users          Setup for all users"
    echo "    setup-garmin --email <email> --password <pass> [opts]"
    echo "  help                     Show this help message"
    echo ""
    echo "Any other command is executed directly (e.g. 'sh' for a debug shell)."
    ;;
  *)
    exec "$@"
    ;;
esac
