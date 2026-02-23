# Railway Deployment (Backend + Socket.IO)

## Why this works
- This backend needs long-lived Socket.IO connections.
- Railway supports WebSockets and keeps a persistent server process.

## Config included in repo
- `railway.toml`: forces Nixpacks builder and sets healthcheck/start command.
- `nixpacks.toml`: explicit install + start commands for Node app.

## Deploy steps
1. Push latest code to GitHub.
2. In Railway:
   - New Project -> Deploy from GitHub repo.
   - Ensure **Root Directory** is repository root (where `package.json` and `src/` exist), not `machine-simulator/`.
3. In Railway service Variables, set:
   - `PORT` (Railway usually injects this automatically).
   - `PUBLIC_BASE_URL` as your Railway public URL.
   - `ORDER_AMOUNT_INR`
   - `ORDER_CURRENCY`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `FIREBASE_DATABASE_URL`
   - Firebase Admin credentials:
     - preferred on Railway: `FIREBASE_SERVICE_ACCOUNT_JSON` (full one-line JSON string)
     - and leave `FIREBASE_SERVICE_ACCOUNT_PATH` empty
   - `MACHINE_SHARED_TOKEN`
   - optional `MACHINE_TOKENS_JSON`
   - `MACHINE_HEARTBEAT_TIMEOUT_MS`
   - `MACHINE_HEARTBEAT_CHECK_MS`
4. Redeploy service after setting variables.
5. Verify endpoints:
   - `/health`
   - `/docs`
   - `/openapi.json`
   - `/machine/socket-contract`

## Common failure fixes
- `Railpack could not determine how to build`:
  - Ensure root directory is correct.
  - Ensure `railway.toml` and `nixpacks.toml` are present in repo root.
  - Trigger a new deploy after pushing these files.
- Runtime crash due Firebase:
  - `FIREBASE_SERVICE_ACCOUNT_JSON` must be valid JSON with escaped newlines in private key if needed.
- Machine not connecting:
  - Check machine token matches `MACHINE_SHARED_TOKEN` or `MACHINE_TOKENS_JSON[machineId]`.

## Machine simulator against Railway URL
- In `machine-simulator/.env`:
  - `BACKEND_URL=https://<your-railway-domain>`
  - `MACHINE_ID=M01`
  - `MACHINE_TOKEN=<matching token>`
- Run simulator and confirm machine appears ONLINE via `/machine/status?machineId=M01`.
