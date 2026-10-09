#!/bin/sh
# Run from the project root: sh scripts/setup.sh
set -eu
if [ ! -f .env ]; then
    cp .env.example .env
    printf 'Choose an app password (at least 12 characters): '
    trap 'stty echo 2>/dev/null || true' EXIT INT TERM
    stty -echo
    IFS= read -r password
    stty echo
    printf '\n'
    if [ "${#password}" -lt 12 ]; then
        echo 'Password too short. Edit APP_PASSWORD in .env, then run docker compose up -d --build.'
        exit 1
    fi
    # Python serializes dotenv quoting safely, including apostrophes and backslashes.
    # No password is included in command-line arguments or printed to the terminal.
    printf '%s' "$password" | docker run --rm -i -v "$PWD:/workspace" python:3.12-slim \
        python -c 'import pathlib,sys; p=pathlib.Path("/workspace/.env"); password=sys.stdin.read(); q=password.replace("\\", "\\\\").replace("\x27", "\\\x27"); p.write_text(p.read_text().replace("APP_PASSWORD=\x27change-this-password\x27", "APP_PASSWORD=\x27"+q+"\x27")); p.chmod(0o600)'
fi
docker compose up -d --build
echo 'Still is starting. Open http://YOUR_SERVER_IP:8080 (or your configured PORT).'
