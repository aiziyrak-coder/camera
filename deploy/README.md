# Production deploy — cam.fermi.uz

## DNS (A records → server IP `87.192.230.208`)

| Name (in fermi.uz zone) | Full domain | Purpose |
|-------------------------|-------------|---------|
| `cam` | `cam.fermi.uz` | React frontend |
| `camapi` | `camapi.fermi.uz` | FastAPI backend + WebSocket |
| `storage.camapi` | `storage.camapi.fermi.uz` | MinIO (presigned upload URLs) |
| `stream.cam` | `stream.cam.fermi.uz` | MediaMTX HLS video streams |

Add records in **ahost.uz → Mening domenlar → fermi.uz → DNS hosting → Zone Editor**:

1. **Type:** A, **Name:** `storage.camapi`, **Value:** `87.192.230.208`
2. **Type:** A, **Name:** `stream.cam`, **Value:** `87.192.230.208`

After DNS propagates (5–30 min), the server auto-installs SSL:

```bash
# Timer checks every 5 minutes — or run manually:
sudo bash /opt/camera/deploy/wait-dns-storage-stream.sh
```

Remove duplicate nginx configs (if `cam-fermi-*` warnings appear):

```bash
sudo bash /opt/camera/deploy/nginx-cleanup-fermi.sh
```

## Updating production (on the server)

After changes are pushed to `main`:

```bash
sudo bash /opt/camera/deploy/server-pull.sh
```

It pulls `main`, merges `deploy/env.production.scale` into `camera-api/.env`
(`deploy/merge_env.py` — other keys and secrets are left alone), builds the
frontend, copies `deploy/mediamtx.yml`, updates nginx with
`deploy/nginx_sync.py` (backups + automatic rollback when `nginx -t` fails;
`--dry-run` shows the diff only) and recreates the Docker stack with the
three MediaMTX shards. Database migrations run when the API starts.

### Live video access (one time)

MediaMTX has no user check of its own. HLS links handed out by the API are
signed (`/sN/<md5>,<expires>/cam-<uuid>/...`, see
`camera-api/app/services/stream_links.py`) and nginx rejects everything else.
Enable it once, after `server-pull.sh`:

```bash
sudo bash /opt/camera/deploy/enable-stream-auth.sh
```

The script shares one secret between `camera-api/.env` (`STREAM_URL_SECRET`)
and `/etc/nginx/snippets/cam-stream-secret.conf`, checks that a signed link
really plays and only then closes unsigned links. MediaMTX ports are bound to
`127.0.0.1`, so the LAN cannot bypass nginx either.

## One-command deploy (on the server)

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/riskgroup77/camera.git /opt/camera
cd /opt/camera
sudo bash deploy/server-setup.sh
```

For servers that already have Docker/nginx/node installed:

```bash
sudo bash deploy/server-setup-slim.sh
```

## Migrate devflix → fermi domains

If the stack was deployed with old `*.devflix.uz` domains:

```bash
sudo bash deploy/migrate-to-fermi.sh
```

## SSH note

If port 22 is blocked externally, use the port that responds (often `2222`):

```bash
ssh admin_root@87.192.230.208 -p 2222
```

## Login users

Production creates **no demo users**. On an empty database the API creates one
Super Admin from `INITIAL_ADMIN_LOGIN` / `INITIAL_ADMIN_PASSWORD` in
`camera-api/.env`; the setup scripts generate these (`camadmin` + a random
password) and save them in `/opt/camera/deploy/.secrets.env` (never committed).

The demo users `admin` / `admin123` and `operator` / `operator123` exist only
when `SEED_DEMO_USERS=true` (local development and tests). Their passwords are
public — if an older install still has them, change both passwords. While any
of them still works, the admin dashboard and *Tizim jurnali* show a critical
alert. `bash deploy/test-login.sh` checks that the demo passwords are rejected.

## Manual checks

```bash
curl https://camapi.fermi.uz/health
docker compose -f /opt/camera/camera-api logs -f api
```

## Port mapping (host)

| Service | Host port | Notes |
|---------|-----------|-------|
| API | `127.0.0.1:18080` | nginx proxies HTTPS |
| MinIO | `127.0.0.1:9100` | storage subdomain |
| MediaMTX HLS | `8888` | stream subdomain |

After changing `.env`, recreate the API container so CORS and other env vars reload:

```bash
cd /opt/camera/camera-api
sudo docker compose up -d --force-recreate api
```
