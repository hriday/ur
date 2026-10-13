#!/usr/bin/env bash
# Build locally, ship only the runtime artifacts, install runtime deps on the
# server, restart the service and health-check it. Idempotent; re-run to update.
# Prerequisite (once): ./deploy/setup.sh
set -euo pipefail
HOST="${UR_HOST:-root@ur.moosha.org}"
APP=/opt/ur/app
cd "$(dirname "$0")/.."

echo "== build"
npm run build

echo "== runtime package.json"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
node -e '
  // Pin the exact versions installed (and tested) locally.
  const pick = ["better-sqlite3", "express", "ws"];
  const deps = Object.fromEntries(pick.map((k) => [k, require("./node_modules/" + k + "/package.json").version]));
  const pkg = { name: "ur-runtime", private: true, type: "module", dependencies: deps };
  require("fs").writeFileSync(process.argv[1] + "/package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$STAGE"
cat "$STAGE/package.json"

echo "== rsync artifacts"
ssh "$HOST" "mkdir -p $APP/server/dist $APP/client/dist"
rsync -rlptz --delete server/dist/ "$HOST:$APP/server/dist/"
rsync -rlptz --delete client/dist/ "$HOST:$APP/client/dist/"
rsync -rlptz "$STAGE/package.json" "$HOST:$APP/package.json"

echo "== install runtime deps, restart"
ssh "$HOST" "set -e
  chown -R ur:ur /opt/ur
  cd $APP
  runuser -u ur -- env HOME=/opt/ur npm install --omit=dev --no-audit --no-fund --no-update-notifier
  systemctl restart ur
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:8023/healthz 2>/dev/null; then echo ' - ur is running'; exit 0; fi
    sleep 1
  done
  echo 'health check FAILED' >&2
  journalctl -u ur -n 30 --no-pager >&2
  exit 1"
