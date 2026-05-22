# style-ai-site

Personal-use virtual try-on. Upload a person photo + a garment photo, get a composite. Inference runs locally on your GPU (RTX 5070 Ti).

## Architecture

Two processes:

- `server/` — Next.js site (App Router + SQLite). Stores metadata + job queue only. **Never stores image bytes.**
- `inference/` — Python FastAPI. Stores image bytes, serves them via signed read URLs, runs try-on inference.

The site talks to inference over HTTP with a Bearer `SHARED_SECRET`. Browsers read images directly from inference via signed read URLs (`?t=<token>`).

```
browser ──(HTTP)──> server (Next.js) ──(Bearer)──> inference (FastAPI) ──> GPU
   └──(signed URL)────────────────────────────────────^ image bytes
```

## Local development (both processes on your Windows PC, localhost)

This is the recommended way to test end-to-end before deploying.

### server/

```powershell
cd server
cp .env.example .env.local
# edit .env.local: set SHARED_SECRET to anything for dev (e.g. "dev-secret"),
# set INFERENCE_BASE_URL=http://localhost:8000
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

Open http://localhost:3000 and try the upload → compose → poll cycle with `PROVIDER=mock`. Mock provider returns the garment image as the "result" — useful to verify the wiring.

### Switch to real model (FASHN VTON v1.5)

1. Install PyTorch for your GPU:
   ```powershell
   pip install torch --index-url https://download.pytorch.org/whl/cu128
   # if that fails on sm_120 (Blackwell), try nightly:
   pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128
   ```
2. Download FASHN VTON v1.5 weights (see `inference/providers/fashn_vton_v15.py`).
3. Set `PROVIDER=fashn_vton_v15` in `inference/.env` and restart.

## Production deployment (after local testing passes)

The site moves to your friend's Linux server. Inference **stays on your Windows PC**.

Both machines must be on the same Tailscale tailnet. The site listens on the tailnet IP only — **not 0.0.0.0**. You access the site via Tailscale on your own devices (desktop, phone). No public domain in MVP.

### Friend's Linux server (Ubuntu/Debian)

```bash
# install Node 20, Tailscale
sudo apt install -y nodejs npm
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# deploy
git clone https://github.com/Kacarong/style-ai-site.git
cd style-ai-site/server
cp .env.example .env
# edit .env:
#   SHARED_SECRET=<openssl rand -base64 48>
#   INFERENCE_BASE_URL=http://<your-PC-tailnet-ip>:8000
#   HOSTNAME=<this-server-tailnet-ip>
npm install
npm run build

# systemd unit (see deploy/style-ai-site.service)
sudo cp deploy/style-ai-site.service /etc/systemd/system/
sudo cp deploy/style-ai-site-worker.service /etc/systemd/system/
sudo systemctl enable --now style-ai-site style-ai-site-worker
```

### Your PC (Windows + RTX 5070 Ti)

- Install Tailscale Windows client, keep it always-on.
- Install Python 3.11.
- Inference setup (same as local dev above) but:
  - Set `SHARED_SECRET` in `inference/.env` to the same value as the server.
  - Set `STORAGE_PUBLIC_BASE_URL=http://<your-PC-tailnet-ip>:8000` so signed URLs use the tailnet hostname.
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
- `/storage/<id>` uses signed read tokens (in the URL) instead of Bearer, so `<img src>` works.
- Image bytes never touch the friend's server.
- Tailscale is the access control. No additional password.
