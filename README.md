# Vending Machine Backend

MVP backend for a QR-code-based vending machine payment and dispensing system. Customers scan a printed UPI QR code, payment is confirmed via Razorpay webhook, and the backend commands the physical machine to dispense over a Socket.IO connection.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Payment Modes](#payment-modes)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Reference](#api-reference)
- [Socket.IO Protocol](#socketio-protocol)
- [Firebase Data Model](#firebase-data-model)
- [Machine Simulator](#machine-simulator)
- [One-Time Machine Provisioning](#one-time-machine-provisioning)
- [Deployment (Railway)](#deployment-railway)
- [IoT Hardware Integration](#iot-hardware-integration)

---

## Overview

A vending machine operator sticks a printed UPI QR code on each machine. A customer scans it with GPay, PhonePe, or any UPI app and pays a fixed amount. Razorpay sends a webhook to this backend; the backend verifies the signature, maps the QR code to a machine, and emits a `machine:dispense` Socket.IO event to the connected machine firmware. The machine dispenses, then emits `machine:done`. The backend marks the order completed.

If the machine is offline or busy when the payment arrives, the order is queued as `PAID` and dispatched automatically when the machine reconnects or becomes idle.

---

## Architecture

```
Customer                    Backend (this repo)              Machine (IoT / Simulator)
--------                    -------------------              -------------------------
Scans printed UPI QR  --->  POST /webhooks/razorpay          socket machine:connect
                            - verify HMAC signature           socket machine:heartbeat  ─┐
                            - map qrCodeId -> machineId       socket machine:done       ─┘
                            - create PAID order
                            - emit machine:dispense  ──────>  socket machine:dispense
                                                              (hardware runs)
                                                              socket machine:done  ───>  order COMPLETED
```

**Key components:**

| Component | Path |
|---|---|
| HTTP API | `src/routes/index.js`, `src/modules/*/` |
| Socket.IO machine gateway | `src/modules/machines/machine.socket.js` |
| Order domain | `src/modules/orders/` |
| Payment & webhook domain | `src/modules/payments/` |
| Firebase RTDB adapter | `src/config/firebase-admin.js` |
| Swagger UI | `GET /docs`, raw spec at `GET /openapi.json` |
| Buy page (web) | `src/web/buy.html` |
| Machine simulator | `machine-simulator/` |

---

## Payment Modes

### UPI Scanner Mode (primary — `UPI_SCANNER_MODE=true`)

The default production flow. A fixed-amount, reusable Razorpay QR code is provisioned once per machine. No web checkout is involved.

```
Customer scans QR in UPI app
  └─► Razorpay sends POST /webhooks/razorpay (qr_code.credited)
        └─► Backend verifies HMAC, resolves machine, creates PAID order
              └─► machine:dispense emitted over Socket.IO
```

### Razorpay Checkout (legacy fallback — `UPI_SCANNER_MODE=false`)

A traditional web checkout flow. A customer visits `/buy?machineId=M01`, clicks pay, and Razorpay Checkout handles the card/UPI payment.

```
Customer visits /buy?machineId=M01
  └─► POST /orders/create  (creates Razorpay order)
        └─► Razorpay Checkout completes payment
              └─► POST /payments/verify  (HMAC verify + dispatch)
```

---

## Project Structure

```
.
├── src/
│   ├── index.js                  # Entry point (HTTP + Socket.IO server)
│   ├── app.js                    # Express app factory
│   ├── config/
│   │   ├── constants.js          # ORDER_STATUS, MACHINE_STATUS, SOCKET_EVENTS
│   │   ├── env.js                # Env var parsing and validation
│   │   ├── firebase-admin.js     # Firebase Admin SDK + RTDB helpers
│   │   └── razorpay.js           # Razorpay client
│   ├── docs/
│   │   ├── openapi.js            # OpenAPI spec builder
│   │   └── machine-socket-contract.js
│   ├── middleware/
│   │   ├── error-handler.js
│   │   └── validate-json.js
│   ├── modules/
│   │   ├── machines/             # Machine registry, service, socket handler, repo
│   │   ├── orders/               # Order creation, status transitions, repo
│   │   └── payments/             # Payment verify, webhook service, signature util
│   ├── routes/
│   │   └── index.js              # All HTTP routes
│   └── web/
│       ├── buy.html              # Customer-facing buy page
│       ├── buy.js
│       ├── buy.css
│       └── swagger.html          # Swagger UI host page
├── machine-simulator/            # Standalone IoT simulator (own package.json)
│   └── src/index.js
├── scripts/
│   ├── generate-qr.js            # Generate QR PNG from URL
│   ├── provision-upi-qr.js       # Provision Razorpay QR + write to RTDB
│   └── export-openapi.js         # Export OpenAPI spec to file
├── docs/                         # Supplementary documentation
│   ├── architecture.md
│   ├── api-contract.md
│   ├── deploy-railway.md
│   ├── e2e-buy-flow-line-by-line.md
│   └── iot-machine-guide-beginner.md
├── qr/                           # Generated QR code images (gitignored originals)
├── railway.toml                  # Railway deployment config
└── nixpacks.toml                 # Nixpacks build config
```

---

## Prerequisites

- Node.js 18+
- A [Razorpay](https://razorpay.com) account (test keys work for local dev)
- A Firebase project with Realtime Database enabled
- (Optional) [ngrok](https://ngrok.com) or similar for local webhook testing

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env   # if .env.example exists, else create .env manually
```

Populate `.env` — see [Environment Variables](#environment-variables) below.

### 3. Start the backend

```bash
npm start
```

Server starts at `http://localhost:3000`.

### 4. Start the machine simulator (separate terminal)

```bash
npm run machine
```

This connects a virtual machine `M01` to the local backend via Socket.IO.

### 5. Verify everything is up

```
GET http://localhost:3000/health
GET http://localhost:3000/machine/status?machineId=M01
GET http://localhost:3000/docs     ← Swagger UI
```

---

## Environment Variables

### Backend (root `.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `PUBLIC_BASE_URL` | No | `http://localhost:PORT` | Public URL (used in QR generation) |
| `UPI_SCANNER_MODE` | No | `true` | `true` = UPI QR webhook flow; `false` = web checkout |
| `ORDER_AMOUNT_INR` | No | `20` | Fixed order amount in INR |
| `ORDER_CURRENCY` | No | `INR` | Order currency |
| `RAZORPAY_KEY_ID` | **Yes** | — | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | **Yes** | — | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (UPI mode) | — | Razorpay webhook signing secret |
| `FIREBASE_DATABASE_URL` | **Yes** | — | Firebase RTDB URL (e.g. `https://<project>.firebaseio.com`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | — | Full service account JSON as a single-line string *(recommended on Railway)* |
| `FIREBASE_PROJECT_ID` | Yes* | — | Firebase project ID *(alternative to JSON)* |
| `FIREBASE_CLIENT_EMAIL` | Yes* | — | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Yes* | — | Firebase private key (use `\n` for newlines) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes* | — | Path to `service_account.json` file *(local dev alternative)* |
| `MACHINE_SHARED_TOKEN` | No | `dev-machine-token` | Default auth token for all machines |
| `MACHINE_TOKENS_JSON` | No | `{}` | Per-machine tokens as JSON object: `{"M01":"tok1","M02":"tok2"}` |
| `MACHINE_HEARTBEAT_TIMEOUT_MS` | No | `30000` | Mark machine offline after this many ms of silence |
| `MACHINE_HEARTBEAT_CHECK_MS` | No | `5000` | How often to sweep for stale machines |

\* Exactly one of the three Firebase credential methods must be provided: `FIREBASE_SERVICE_ACCOUNT_JSON`, the triple `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`, or `FIREBASE_SERVICE_ACCOUNT_PATH`.

### Machine Simulator (`machine-simulator/.env`)

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:3000` | Backend server URL |
| `MACHINE_ID` | `M01` | Machine identifier |
| `MACHINE_TOKEN` | `dev-machine-token` | Auth token |
| `SIM_HEARTBEAT_MS` | `10000` | Heartbeat interval in ms |
| `SIM_DISPENSE_DELAY_MS` | `2000` | Simulated dispense duration in ms |
| `SIM_FAIL_RATE` | `0` | Probability `[0–1]` of a simulated dispense failure |

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the backend server |
| `npm run machine` | Start the machine simulator |
| `npm run qr:generate` | Generate a QR code PNG from a URL |
| `npm run qr:provision -- M01,M02` | Provision Razorpay UPI QR codes for the given machine IDs and write them to Firebase RTDB |
| `npm run docs:export` | Export the OpenAPI spec to `docs/openapi.json` |

---

## API Reference

Full interactive docs available at `GET /docs` (Swagger UI) and `GET /openapi.json`.

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/health` `/healthz` `/ready` `/live` | Health check aliases |

**Response `200`**
```json
{ "ok": true, "databaseMode": "admin", "ts": 1730000000000 }
```

### Config

| Method | Path | Description |
|---|---|---|
| GET | `/config/public` | Public runtime config |

**Response `200`**
```json
{ "upiScannerMode": true, "orderAmountInr": 20, "orderCurrency": "INR" }
```

### Orders

| Method | Path | Description |
|---|---|---|
| POST | `/orders/create` | Create a Razorpay order (legacy checkout mode) |
| GET | `/orders/:orderId` | Get order status |

**POST `/orders/create`** — Request body:
```json
{ "machineId": "M01" }
```
Response `201`:
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "machineId": "M01",
  "amount": 20,
  "currency": "INR",
  "razorpayOrderId": "order_xxx",
  "razorpayKeyId": "rzp_test_xxx"
}
```
Errors: `400 INVALID_REQUEST`, `409 MACHINE_OFFLINE`, `409 MACHINE_BUSY`

**GET `/orders/:orderId`** — Response `200`:
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "machineId": "M01",
  "status": "DISPENSING",
  "amount": 20,
  "currency": "INR",
  "failureCode": null,
  "updatedAt": 1730000000000
}
```
Order statuses: `CREATED` → `PAID` → `DISPENSING` → `COMPLETED` | `FAILED`

### Payments

| Method | Path | Description |
|---|---|---|
| POST | `/payments/verify` | Verify Razorpay signature (legacy checkout mode) |
| POST | `/webhooks/razorpay` | Razorpay webhook receiver (UPI scanner mode) |

**POST `/webhooks/razorpay`** — Headers: `X-Razorpay-Signature: <hmac>` — Body: raw Razorpay webhook JSON.

Response `200`:
```json
{
  "ok": true,
  "paymentId": "pay_xxx",
  "machineId": "M01",
  "orderId": "ORD_XXXXXXXXXX",
  "status": "DISPENSING",
  "dispatch": "SENT"
}
```
When machine is offline, `dispatch` is `"QUEUED"` and the order is dispatched on next machine heartbeat.

Idempotent (duplicate event):
```json
{ "ok": true, "idempotent": true, "paymentId": "pay_xxx" }
```

### Machine

| Method | Path | Description |
|---|---|---|
| GET | `/machine/status?machineId=M01` | Machine online/offline status |
| GET | `/machine/socket-contract` | Socket event schema |

### Web UI

| Method | Path | Description |
|---|---|---|
| GET | `/buy?machineId=M01` | Customer-facing buy page |
| GET | `/docs` | Swagger UI |

---

## Socket.IO Protocol

The machine connects to the same HTTP server with Socket.IO (WebSocket transport). All events use acknowledgment callbacks.

### Client → Server

**`machine:connect`** — Send once after connection. Authenticates the machine.
```json
// payload
{ "machineId": "M01", "token": "dev-machine-token" }
// ack success
{ "ok": true, "machineId": "M01" }
// ack failure
{ "ok": false, "error": { "code": "UNAUTHORIZED_MACHINE", "message": "..." } }
```

**`machine:heartbeat`** — Send every ~10 seconds to stay online.
```json
// payload
{ "machineId": "M01", "ts": 1730000000000 }
// ack success
{ "ok": true, "ts": 1730000000000 }
```
If heartbeats stop for longer than `MACHINE_HEARTBEAT_TIMEOUT_MS`, the machine is marked `OFFLINE`.

**`machine:done`** — Send after dispense cycle completes.
```json
// success
{ "orderId": "ORD_XXXXXXXXXX", "result": "SUCCESS" }
// failure
{ "orderId": "ORD_XXXXXXXXXX", "result": "FAILED" }
// ack
{ "ok": true, "orderId": "ORD_XXXXXXXXXX" }
```

### Server → Client

**`machine:dispense`** — Hardware trigger. Sent when a paid order is ready.
```json
{ "type": "DISPENSE", "orderId": "ORD_XXXXXXXXXX" }
```

### Machine States

| Status | Meaning |
|---|---|
| `ONLINE` / `IDLE` | Connected, ready to dispense |
| `DISPENSING` | Currently running a dispense cycle |
| `OFFLINE` | Disconnected or heartbeat timed out |

---

## Firebase Data Model

All state is persisted in Firebase Realtime Database.

```
machines/{machineId}
  status              ONLINE | OFFLINE | DISPENSING | IDLE
  lastSeenAt          Unix ms timestamp
  socketConnected     boolean
  paymentProfile/
    provider          "razorpay"
    qrCodeId          Razorpay QR code ID
    qrImageUrl        Downloadable QR image URL
    qrShortUrl        Shortened URL
    fixedAmountPaise  Payment amount in paise

qrCodeToMachine/{qrCodeId}
  machineId           Maps QR code back to machine

orders/{orderId}
  machineId
  amount              INR
  currency
  razorpayOrderId
  razorpayPaymentId
  source              RAZORPAY_CHECKOUT | UPI_QR_WEBHOOK
  provider            "razorpay"
  providerPaymentId
  providerQrCodeId
  paidAt
  dispatchPending     boolean — true when paid but not yet dispatched
  status              CREATED | PAID | DISPENSING | COMPLETED | FAILED
  createdAt / updatedAt
  failureCode

paymentEvents/{providerPaymentId}
  status              PROCESSING | PROCESSED | REJECTED
  reason
  machineId
  orderId
  dispatch            NOT_SENT | SENT | QUEUED
  amountPaise
  event               qr_code.credited | payment.captured
  processedAt / updatedAt
```

---

## Machine Simulator

`machine-simulator/` is a standalone Node.js project that emulates real machine firmware for local development and testing. It requires no physical hardware.

```bash
# Install
cd machine-simulator
npm install
cp .env.example .env   # edit as needed

# Run
npm start
```

**What it does:**
1. Connects to the backend via Socket.IO.
2. Emits `machine:connect` to authenticate.
3. Sends `machine:heartbeat` on a configurable interval.
4. Listens for `machine:dispense`, waits `SIM_DISPENSE_DELAY_MS`, then emits `machine:done`.
5. Randomly reports `FAILED` based on `SIM_FAIL_RATE`.

You can also start the simulator from the repository root:
```bash
npm run machine
```

---

## One-Time Machine Provisioning

Before a machine can accept UPI payments, its QR code must be provisioned in Razorpay and written to Firebase:

```bash
npm run qr:provision -- M01,M02
```

This script:
1. Creates a fixed-amount, reusable Razorpay UPI QR code per machine.
2. Writes `machines/{machineId}/paymentProfile` to Firebase RTDB.
3. Writes the `qrCodeToMachine/{qrCodeId}` lookup to Firebase RTDB.
4. Saves a printable QR PNG to `qr/{machineId}.png`.

Print the PNG and affix it to the physical machine. That QR code is permanent — customers scan it every time.

---

## Deployment (Railway)

The backend is ready for deployment on [Railway](https://railway.app), which supports persistent WebSocket connections.

**Included config files:**
- `railway.toml` — forces Nixpacks builder, sets start command, healthcheck, and restart policy.
- `nixpacks.toml` — explicit install and start commands.

**Deploy steps:**

1. Push the repository to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**.
   - Set **Root Directory** to the repository root (where `package.json` lives), not `machine-simulator/`.
3. Set the following environment variables in the Railway service:

   | Variable | Notes |
   |---|---|
   | `PUBLIC_BASE_URL` | Your Railway public domain, e.g. `https://my-app.up.railway.app` |
   | `UPI_SCANNER_MODE` | `true` for production |
   | `ORDER_AMOUNT_INR` | Fixed price in INR |
   | `RAZORPAY_KEY_ID` | Razorpay live/test key |
   | `RAZORPAY_KEY_SECRET` | Razorpay live/test secret |
   | `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC secret |
   | `FIREBASE_DATABASE_URL` | RTDB URL |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON (single-line string, recommended) |
   | `MACHINE_SHARED_TOKEN` | Shared auth token for machines |

4. Redeploy after setting variables.
5. Configure Razorpay webhook:
   - **URL**: `https://<railway-domain>/webhooks/razorpay`
   - **Secret**: same as `RAZORPAY_WEBHOOK_SECRET`
   - **Events**: enable `qr_code.credited` (and optionally `payment.captured`)
6. Verify the deployment:
   - `GET /health`
   - `GET /config/public`
   - `GET /docs`

**Connecting the simulator to Railway:**
```bash
# machine-simulator/.env
BACKEND_URL=https://<your-railway-domain>
MACHINE_ID=M01
MACHINE_TOKEN=<matching MACHINE_SHARED_TOKEN>
```

---

## IoT Hardware Integration

For firmware engineers connecting real hardware, only four Socket.IO events are needed. See [`docs/iot-machine-guide-beginner.md`](docs/iot-machine-guide-beginner.md) for a full beginner-friendly guide.

**Quick summary:**

1. Connect to the Socket.IO server and emit `machine:connect` with `machineId` and `token`.
2. Send `machine:heartbeat` every 10 seconds to stay online.
3. Listen for `machine:dispense` and run the hardware dispense cycle.
4. When the cycle ends, emit `machine:done` with `SUCCESS` or `FAILED`.

**Common mistakes:**
- Wrong token → `machine:connect` rejected.
- Heartbeat stops → machine marked `OFFLINE`, orders queue up.
- Forgetting `machine:done` → order stuck at `DISPENSING` indefinitely.

---

## License

ISC
