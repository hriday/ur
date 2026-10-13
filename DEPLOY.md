# Deploying the Royal Game of Ur

Production: **https://ur.moosha.org**, on the shared server `root@ur.moosha.org`
(Ubuntu 24.04, Node 22 at `/usr/bin/node`, Caddy fronting ~20 other sites).

The app is built **locally** and only the runtime artifacts are shipped. Nothing
is compiled on the server, and the deploy scripts install no system packages.

## Layout on the server

| What | Where |
|---|---|
| Server bundle | `/opt/ur/app/server/dist/index.js` |
| Client build | `/opt/ur/app/client/dist/` (served by the Node app via `CLIENT_DIR`) |
| Runtime deps | `/opt/ur/app/package.json` + `node_modules` (better-sqlite3, express, ws only) |
| SQLite database | `/var/lib/ur/ur.sqlite` (+ `-wal`/`-shm`) |
| Service | `ur.service` (`/etc/systemd/system/ur.service`), runs as system user `ur` |
| HTTPS | Caddy site block `ur.moosha.org` in `/etc/caddy/Caddyfile` |

The Node server listens on **`127.0.0.1:8023`** (other local ports on this host
are taken by other apps). Caddy terminates TLS and proxies HTTP and WebSocket
(`wss://ur.moosha.org/ws`) traffic to it. The unit is sandboxed
(`ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`); only
`/var/lib/ur` is writable.

## Files in `deploy/`

- `ur.service` - the systemd unit.
- `Caddyfile` - the single site block appended to `/etc/caddy/Caddyfile`.
- `setup.sh` - one-time preparation (run locally; it drives ssh). Creates the `ur`
  user and directories, installs and enables the unit, and appends the Caddy block
  only if `ur.moosha.org` is not already present: it backs up the Caddyfile to
  `/etc/caddy/Caddyfile.bak-preur-<timestamp>`, runs `caddy validate`, reloads on
  success and restores the backup on failure. Safe to re-run.
- `deploy.sh` - `npm run build` locally, rsync `server/dist/`, `client/dist/` and a
  generated runtime `package.json` to `/opt/ur/app`, `npm install --omit=dev` there
  as `ur`, restart the service and health-check `127.0.0.1:8023/healthz`.
  Idempotent; re-run for every update.

Both scripts honour `UR_HOST` (default `root@ur.moosha.org`).

## First-time setup

```bash
./deploy/setup.sh
./deploy/deploy.sh
```

## Deploying an update

```bash
npm test && npx playwright test   # local only - never point the e2e suite at production
./deploy/deploy.sh                # ends with "ok - ur is running"
curl -fsS https://ur.moosha.org/healthz
```

## Operations

- Status: `ssh root@ur.moosha.org systemctl status ur`
- Logs: `ssh root@ur.moosha.org journalctl -u ur -f`
- Restart: `ssh root@ur.moosha.org systemctl restart ur`
- Backup the database (online-safe):
  `ssh root@ur.moosha.org "sqlite3 /var/lib/ur/ur.sqlite \".backup '/root/ur-\$(date +%F).sqlite'\""`
- Games with no moves for 7 days are deleted automatically (hourly sweep).

## Removing it

```bash
ssh root@ur.moosha.org 'systemctl disable --now ur && rm /etc/systemd/system/ur.service && systemctl daemon-reload'
# then delete the ur.moosha.org block from /etc/caddy/Caddyfile (back it up first),
# caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
# and optionally: rm -rf /opt/ur /var/lib/ur && userdel ur
```
