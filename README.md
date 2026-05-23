# style-ai-site

Personal-use virtual try-on. Upload a person photo + a garment photo, get a composite. Inference runs locally on your GPU (RTX 5070 Ti).

## Architecture

Two processes:

- `server/` — Next.js site (App Router + SQLite). Stores metadata + job queue only. **Never stores image bytes** — when the browser requests an image, the site fetches it from inference and streams it through; bytes never hit disk on the site server.
- `inference/` — Python FastAPI. Stores image bytes, serves them via signed read URLs, runs try-on inference.

The site talks to inference over HTTP with a Bearer `SHARED_SECRET`. The browser only talks to the site (same-origin) — image requests are proxied at `/api/image/<id>?t=<token>` so the browser never needs the inference host to be reachable.

```
browser ──(same-origin)──> server (Next.js) ──(Bearer + signed URL)──> inference (FastAPI) ──> GPU
              /api/image/<id>?t=<token>  ──proxy stream──>  /storage/<id>?t=<token>
```

## Local development (both processes on your Windows PC, localhost)

This is the recommended way to test end-to-end before deploying.

### server/

```powershell
cd server
cp .env.example .env.local
# edit .env.local: set SHARED_SECRET to anything for dev (e.g. "dev-secret"),
# set INFERENCE_BASE_URL=http://127.0.0.1:8000
# (use 127.0.0.1, NOT localhost — on Windows, Node 20's fetch resolves
#  "localhost" to IPv6 ::1 but uvicorn binds IPv4 only, so the inference
#  badge stays "오프라인" even though curl works.)
npm install
npm run dev          # terminal 1 — Next.js on http://localhost:3000
npm run worker       # terminal 2 — queue worker
```

### inference/

```powershell
cd inference
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# edit .env: SHARED_SECRET must match server/.env.local
# PROVIDER=mock to start
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://localhost:3000 and try the upload → compose → poll cycle with `PROVIDER=mock`. The mock provider returns a side-by-side composite of the person and garment (no model work) — useful to verify the upload → queue → worker → result wiring before you set up the real GPU model.

### Switch to real model (FASHN VTON v1.5)

Apache-2.0 licensed, ~1.94GB weights, ~8GB VRAM. Runs locally on your GPU — no per-call cost.

1. Install PyTorch + torchvision for your GPU (must be done **before** `pip install -e .` so pip doesn't later pull a CPU-only `torchvision` from PyPI and mismatch the CUDA build):
   ```powershell
   cd inference
   .venv\Scripts\activate
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
   # if that fails on sm_120 (Blackwell, RTX 50-series), try nightly:
   pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128
   ```
2. Clone and install the FASHN VTON v1.5 package (in the **same venv** as `inference/`):
   ```powershell
   cd C:\dev               # or wherever you keep source checkouts
   git clone https://github.com/fashn-AI/fashn-vton-1.5.git
   cd fashn-vton-1.5
   pip install -e .
   python scripts\download_weights.py --weights-dir .\weights
   ```
3. Edit `inference/.env`:
   ```
   PROVIDER=fashn_vton_v15
   FASHN_WEIGHTS_DIR=C:\dev\fashn-vton-1.5\weights
   ```
4. Restart `uvicorn`. First `/tryon` call will take ~20s extra to load weights into VRAM; subsequent calls reuse the cached pipeline.

The "합성 서버" badge in the UI will show `정상 · 로컬 AI (FASHN VTON v1.5)` when the provider switch is live.

## Production deployment (after local testing passes)

The site moves to your friend's Linux server. Inference **stays on your Windows PC**.

Both machines must be on the same Tailscale tailnet. The site listens on the tailnet IP only — **not 0.0.0.0**. You access the site via Tailscale on your own devices (desktop, phone). No public domain in MVP.

### Friend's Linux server (Ubuntu/Debian)

```bash
# install Node 20 (NodeSource — the Ubuntu/Debian default repo doesn't
# guarantee 20, and Next 15 requires it)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x
npm -v

# install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# deploy — the systemd units assume the repo lives at /opt/style-ai-site,
# so clone it there directly.
sudo git clone https://github.com/Kacarong/style-ai-site.git /opt/style-ai-site
cd /opt/style-ai-site/server
sudo cp .env.example .env
sudo $EDITOR .env
# .env values:
#   SHARED_SECRET=<openssl rand -base64 48>
#   INFERENCE_BASE_URL=http://<your-PC-tailnet-ip>:8000
#   HOSTNAME=<this-server-tailnet-ip>
sudo npm ci         # reproducible install from package-lock.json
sudo npm run build

# systemd units
sudo cp /opt/style-ai-site/deploy/style-ai-site.service /etc/systemd/system/
sudo cp /opt/style-ai-site/deploy/style-ai-site-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now style-ai-site style-ai-site-worker
```

### Your PC (Windows + RTX 5070 Ti)

- Install Tailscale Windows client, keep it always-on.
- Install Python 3.11.
- Inference setup (same as local dev above) but:
  - Set `SHARED_SECRET` in `inference/.env` to the same value as the server.
  - Set `STORAGE_PUBLIC_BASE_URL=http://<your-PC-tailnet-ip>:8000`. With the `/api/image` proxy the browser never hits this URL directly — the friend's server uses it to fetch image bytes over the tailnet and streams them back same-origin.
  - Bind to your tailnet IP: `uvicorn app.main:app --host <your-PC-tailnet-ip> --port 8000`.
- Register as a Windows service with NSSM so it starts on boot:
  ```powershell
  nssm install StyleAI-Inference "C:\path\to\.venv\Scripts\python.exe" "-m" "uvicorn" "app.main:app" "--host" "<tailnet-ip>" "--port" "8000"
  nssm set StyleAI-Inference AppDirectory "C:\path\to\inference"
  nssm start StyleAI-Inference
  ```

### Future: public access

MVP is Tailscale-only. If you later want public access without exposing your PC:

- **Option A**: add a `/api/media/<id>` proxy in the Next.js server. Browser hits the public site; the site fetches image bytes from inference (with Bearer) and streams them. Friend's server bytes-through, but never stores.
- **Option B**: Cloudflare Tunnel + Access on both machines, gated by your Google/email.

Both are non-trivial. Skip until MVP works.

## Security notes

- `SHARED_SECRET` is **server-to-inference only**. Never put it in `NEXT_PUBLIC_*`, never send to the browser.
- `/storage/<id>` uses signed read tokens (in the URL) instead of Bearer, so the site server can fetch images without a header.
- The friend's server streams image bytes through (`/api/image` proxy) but **never stores them on disk**. Only metadata (URLs, statuses) lives in SQLite there.
- Tailscale is the access control. No additional password.
