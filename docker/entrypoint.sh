#!/bin/sh
# Renouvelle node_modules (volume) quand package-lock.json a changé depuis sa dernière installation.
set -eu
cd /app
current="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -f node_modules/.lock-hash ] || [ "$(cat node_modules/.lock-hash)" != "$current" ]; then
  echo "package-lock.json a changé : npm ci…"
  npm ci
  echo "$current" > node_modules/.lock-hash
fi
exec "$@"
