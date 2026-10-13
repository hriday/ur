#!/usr/bin/env bash
# One-time preparation of the shared server for ur.moosha.org. Run locally:
#   ./deploy/setup.sh
# Safe to re-run. Installs NO packages; touches only the `ur` user,
# /opt/ur, /var/lib/ur, /etc/systemd/system/ur.service and one appended
# Caddy site block (after backing up the Caddyfile and validating).
set -euo pipefail
HOST="${UR_HOST:-root@ur.moosha.org}"
cd "$(dirname "$0")"

echo "== user, directories, systemd unit"
ssh "$HOST" 'set -e
  id ur >/dev/null 2>&1 || useradd --system --home-dir /opt/ur --no-create-home --shell /usr/sbin/nologin ur
  mkdir -p /opt/ur/app /var/lib/ur
  chown -R ur:ur /opt/ur /var/lib/ur
  chmod 750 /var/lib/ur
  cat > /etc/systemd/system/ur.service
  systemctl daemon-reload
  systemctl enable ur'  < ur.service

echo "== Caddy site block"
ssh "$HOST" 'set -e
  CF=/etc/caddy/Caddyfile
  if grep -q "^ur\.moosha\.org" "$CF"; then
    echo "ur.moosha.org already present in $CF - leaving it alone"; cat >/dev/null; exit 0
  fi
  BAK="$CF.bak-preur-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CF" "$BAK"
  echo "backup: $BAK"
  { printf "\n"; cat; } >> "$CF"
  if caddy validate --config "$CF" --adapter caddyfile; then
    systemctl reload caddy
    echo "caddy reloaded"
  else
    cp -p "$BAK" "$CF"
    echo "caddy validate FAILED - restored $BAK" >&2
    exit 1
  fi' < Caddyfile

echo "setup complete - now run ./deploy/deploy.sh"
