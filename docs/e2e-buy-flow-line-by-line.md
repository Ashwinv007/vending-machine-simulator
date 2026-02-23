# E2E Buy Flow Deep Explanation (File-by-File, Line-by-Line)

This document explains the runtime flow starting from:

`http://localhost:3000/buy?machineId=M01`

It maps the code path file-by-file with line references and shows how data moves across:

- Browser UI
- Node/Express HTTP API
- Razorpay order + signature verification
- Firebase Realtime Database (Admin SDK)
- Socket.IO machine dispatch and machine completion

Note: For readability, contiguous lines that implement one atomic action are described together.

## 1) Boot and wiring

### `src/config/env.js`

- `1-3`: Loads `.env` using `dotenv.config()` so process env vars are available everywhere.
- `5-11`: `requireEnv(name)` helper throws immediately if a required env var is missing.
- `13-24`: `parseNumber(...)` safely parses numeric env values and throws on invalid values.
- `26-40`: `parseJsonObject(...)` parses JSON object env vars (used for machine token maps).
- `42-48`: `normalizePrivateKey(...)` converts escaped newlines (`\\n`) to actual newlines.
- `50`: Computes default `port` from env or `3000`.
- `52-78`: Exports single `env` object used by all modules:
  - `53-55`: generic app settings.
  - `57-58`: order amount/currency settings.
  - `60-61`: required Razorpay credentials.
  - `63-68`: Firebase admin connection settings.
  - `70-73`: machine auth + heartbeat timings.
  - `75-77`: simulator defaults.

### `src/config/firebase-admin.js`

- `1-5`: Imports Firebase Admin SDK APIs + Node fs/path + `env`.
- `7-18`: Parses JSON credentials from `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `20-33`: Loads and parses credentials from file path (`FIREBASE_SERVICE_ACCOUNT_PATH`).
- `35-55`: Resolves credentials in strict priority order:
  1. `FIREBASE_SERVICE_ACCOUNT_PATH`
  2. `FIREBASE_SERVICE_ACCOUNT_JSON`
  3. split fields (`PROJECT_ID`, `CLIENT_EMAIL`, `PRIVATE_KEY`)
  - Throws if none is present (no fallback SDK, admin-only).
- `57-75`: Validates required credential fields.
- `77-90`: Initializes Firebase Admin app and RTDB connection with `cert(...)`.
- `92`: Creates singleton `adminDb` at module load.
- `94`: Exports `databaseMode = "admin"`.
- `96-107`: Exports thin DB helpers:
  - `rtdbGet(path)`
  - `rtdbSet(path, value)`
  - `rtdbUpdate(path, value)`

### `src/config/razorpay.js`

- `1-2`: Imports Razorpay SDK and env.
- `4-7`: Creates singleton Razorpay client (`key_id`, `key_secret`) used by order/payment services.

### `src/app.js`

- `1-7`: Imports express, cors, middleware, and route creator.
- `9-11`: Resolves `src/web` absolute path for serving frontend assets.
- `13-29`: `createApp()` builds express stack:
  - `16`: disables `x-powered-by`.
  - `17`: enables CORS.
  - `18`: parses JSON body.
  - `19`: enforces `application/json` for body methods.
  - `21`: serves static files under `/web`.
  - `23`: mounts API router.
  - `25-26`: 404 + error middleware.
- `31`: exports `app` singleton.

### `src/index.js`

- `1-6`: Imports Node HTTP, Socket.IO, app, env, DB mode, and socket registration.
- `8`: Wraps express app in HTTP server.
- `10-14`: Creates Socket.IO server with permissive CORS.
- `16`: Attaches machine socket event handlers.
- `18-21`: Starts server and logs port + database mode.

## 2) Route entry from `/buy?machineId=M01`

### `src/routes/index.js`

- `1-8`: Imports express router, controllers, validators, and async wrapper.
- `10-12`: Creates router.
- `13-19`: `/health` endpoint (diagnostics).
- `21-36`: `/buy` route:
  - `24`: reads `machineId` query param.
  - `25-32`: validates machine id format; returns `400` if invalid.
  - `34`: serves `buy.html`.
- `38`: registers `POST /orders/create`.
- `39`: registers `POST /payments/verify`.
- `40`: registers `GET /machine/status`.
- `42`: returns router.

## 3) Frontend page load and client-side flow

### `src/web/buy.html`

- `1-15`: document head + fonts + styles + Razorpay checkout script.
- `17-40`: checkout UI skeleton:
  - machine status badge (`id="machine-status"`)
  - machine id (`id="machine-id"`)
  - price text (`id="amount"`)
  - pay button (`id="pay-btn"`)
  - status message (`id="message"`)
- `42`: loads `buy.js` module.

### `src/web/buy.js`

#### URL/bootstrap and element binding
- `1-2`: reads `machineId` from URL query string.
- `4-8`: gets UI DOM refs.
- `10-13`: local UI state.

#### UI helpers
- `15-23`: `setMessage(...)` updates message text + color state.
- `25-29`: `setMachineStatus(...)` updates status badge text + class.
- `31-35`: `setBusy(...)` toggles button disabled/loading text.

#### Backend calls
- `37-51`: `fetchMachineStatus()` calls `GET /machine/status` and blocks pay if OFFLINE.
- `53-69`: `createOrder()` calls `POST /orders/create`.
- `71-87`: `verifyPayment()` calls `POST /payments/verify`.

#### Razorpay checkout
- `89-142`: `openRazorpayCheckout(order)`:
  - `90-92`: guards missing Razorpay SDK script.
  - `94-133`: configures checkout modal with order data.
  - `101-123`: success handler:
    - calls backend `/payments/verify`.
    - if `dispatch === "SENT"`, marks UI as dispensing.
    - else shows pending dispatch state.
  - `124-129`: modal dismiss handler.
  - `135-139`: payment failure handler.
  - `141`: opens Razorpay modal.

#### User click flow
- `144-162`: pay button handler:
  - sets busy state.
  - creates backend order.
  - opens Razorpay checkout.
  - handles errors.

#### Initial page init
- `164-180`: `init()`:
  - validates `machineId` presence.
  - renders machine id and amount.
  - fetches machine status.

## 4) Machine status API (`GET /machine/status`)

### `src/modules/machines/machine.controller.js`

- `1-3`: imports status enum, validator, service.
- `5-34`: controller logic:
  - `6`: reads `machineId` query.
  - `8-15`: validate machine id.
  - `17`: load machine from service (RTDB-backed).
  - `19-26`: if none, return offline default object.
  - `28-33`: return current machine status payload.

### `src/modules/machines/machine.service.js` (status parts)

- `117-119`: `getMachineStatus(machineId)` delegates to repo.

### `src/modules/machines/machine.repo.js` (status parts)

- `5-7`: path helper -> `machines/{machineId}`.
- `41-43`: fetch machine status from RTDB.

## 5) Create order API (`POST /orders/create`)

### `src/modules/orders/order.controller.js`

- `1-2`: imports service + validator.
- `4-18`: request handling:
  - validates payload.
  - on success calls service create.
  - responds `201` with order + Razorpay order metadata.

### `src/modules/orders/order.validators.js` (create-order bits)

- `1-7`: `isValidMachineId` regex check (`2..32`, alnum/underscore/hyphen).
- `9-22`: validates `machineId` in request body.

### `src/modules/orders/order.service.js`

#### Shared helpers
- `11-24`: `buildOrderRecord(...)` builds persisted order object.
- `26-50`: `createRazorpayOrder(...)`:
  - sends order creation to Razorpay (`amount` in paise).
  - wraps provider failures into `AppError(502, RAZORPAY_ORDER_CREATE_FAILED, ...)`.
- `52-58`: shared status updater with `updatedAt`.

#### Core create flow
- `60-95`: `createOrder(machineId)`:
  - `62-64`: validates machine id.
  - `66-69`: checks machine online.
  - `71-74`: blocks if machine currently `DISPENSING`.
  - `76`: generates internal order id.
  - `77`: creates Razorpay order.
  - `79-83`: builds order DB record.
  - `85`: writes order into RTDB.
  - `87-94`: returns client payload (`orderId`, `razorpayOrderId`, `razorpayKeyId`, etc).

#### Status transitions used later
- `97-104`: `getOrderOrThrow`.
- `106-111`: `markPaid`.
- `113-115`: `markDispensing`.
- `117-127`: `markCompleted` (idempotent).
- `129-139`: `markFailed` (idempotent).

### `src/modules/orders/order.repo.js`

- `3-5`: path helper -> `orders/{orderId}`.
- `7-9`: create full order record.
- `11-13`: read order.
- `15-17`: patch update order.

## 6) Payment verification API (`POST /payments/verify`)

### `src/modules/payments/payment.controller.js`

- `1-2`: imports service + validator.
- `4-18`: validates payload, delegates to service, returns result.

### `src/modules/orders/order.validators.js` (payment bits)

- `24-42`: validates required payment fields:
  - `orderId`
  - `razorpay_order_id`
  - `razorpay_payment_id`
  - `razorpay_signature`

### `src/modules/payments/signature.js`

- `3-24`: signature verification:
  - builds `order_id|payment_id` payload.
  - computes expected HMAC SHA256 using Razorpay secret.
  - compares with timing-safe equality.

### `src/modules/payments/payment.service.js`

- `10-16`: extracts fields from request payload.
- `18`: loads order from DB.
- `20-22`: checks Razorpay order id matches stored order.
- `24-33`: verifies signature.
- `35-41`: protects against payment-id conflicts.
- `43-49`: idempotent return if already `COMPLETED` or `DISPENSING`.
- `51-53`: marks order as `PAID` if not already.
- `55-59`: calls machine dispatch (`machine:dispense`).
- `61-63`: if sent, mark order `DISPENSING`.
- `65-69`: returns dispatch result (`SENT` or `PENDING`).

## 7) Socket machine orchestration and completion

### `src/modules/machines/machine.socket.js`

- `13-15`: attach machine service to Socket.IO instance.
- `16`: per-socket connection handler.

#### `machine:connect`
- `17-42`: machine auth handshake:
  - validates machine id.
  - validates token.
  - registers connection + DB online status.
  - returns ack and disconnects unauthorized sockets.

#### `machine:heartbeat`
- `44-61`: heartbeat updates:
  - rejects if machine not connected/authenticated first.
  - updates in-memory lastSeen + RTDB timestamp.

#### `machine:done`
- `63-93`: completion callback from machine:
  - validates connection state + `orderId`.
  - `SUCCESS` -> order `COMPLETED`.
  - other result -> order `FAILED` with `DISPENSE_FAILED`.
  - sets machine status `IDLE`.

#### disconnect
- `95-97`: marks machine offline on disconnect.

### `src/modules/machines/machine.service.js`

- `14-17`: stores Socket.IO ref and starts stale monitor timer.
- `19-31`: heartbeat monitor setup (`setInterval`, unref).
- `33-37`: token auth logic (per-machine token map or shared token).
- `39-43`: on connect -> registry upsert + RTDB `ONLINE`.
- `45-54`: on heartbeat -> refresh registry + RTDB `lastSeenAt`.
- `56-63`: on disconnect -> remove registry entry + RTDB `OFFLINE`.
- `65-76`: stale monitor -> expires machines that stopped heartbeats.
- `78-91`: `isMachineOnline` with timeout check.
- `93-111`: `dispatchDispense(...)`:
  - ensures socket layer is ready.
  - ensures machine exists/online.
  - emits `machine:dispense` to machine socket.
  - sets RTDB machine status `DISPENSING`.
- `113-115`: set machine `IDLE`.
- `117-119`: get machine status.

### `src/modules/machines/machine.repo.js`

- `9-16`: writes machine `ONLINE` state.
- `18-23`: heartbeat touch (`lastSeenAt`, `socketConnected`).
- `25-31`: writes machine `OFFLINE` state.
- `33-39`: generic status writes (e.g., `DISPENSING`, `IDLE`).
- `41-43`: reads machine record.

### `src/modules/machines/machine.registry.js`

- `2-5`: in-memory maps:
  - machineId -> connection metadata.
  - socketId -> machineId.
- `7-22`: `upsert` ensures one active socket per machine.
- `24-33`: `touch` updates heartbeat timestamp.
- `35-37`: `get` by machine id.
- `39-48`: remove by socket id.
- `50-59`: remove by machine id.
- `61-63`: list entries (used by stale monitor).

## 8) Machine simulator side

### `machine-simulator/src/index.js`

- `1-4`: loads env and Socket.IO client.
- `6-11`: resolves backend URL, machine identity, token, timing knobs.
- `13-17`: async wait helper for dispense simulation delay.
- `19-22`: opens websocket transport to backend.
- `24-35`: on connect, emits `machine:connect` and logs auth result.
- `37-39`: disconnect logging.
- `41-61`: on `machine:dispense`:
  - validates payload.
  - simulates motor delay.
  - randomly chooses success/failure by `SIM_FAIL_RATE`.
  - emits `machine:done`.
- `63-69`: sends periodic `machine:heartbeat`.
- `71`: startup log.

### `machine-simulator/.env.example`

- Contains simulator-only vars (`BACKEND_URL`, `MACHINE_ID`, `MACHINE_TOKEN`, heartbeat/dispense/fail-rate knobs).

## 9) Middleware and common utilities used throughout

### `src/middleware/validate-json.js`

- `1`: body methods set (`POST`, `PUT`, `PATCH`).
- `3-6`: skips check for methods without body.
- `8-15`: enforces `application/json` with `415` error.
- `17`: continue middleware chain.

### `src/middleware/error-handler.js`

- `3-10`: 404 handler for unknown routes.
- `12-20`: malformed JSON parse errors -> `400 INVALID_JSON`.
- `22-29`: typed `AppError` serialization.
- `31-44`: fallback error details logging.
- `46-51`: generic `500` response.

### `src/utils/app-error.js`

- `1-8`: custom error type carrying HTTP status and app-specific code.

### `src/utils/async-handler.js`

- `1-5`: wraps async route handlers and forwards errors to error middleware.

### `src/utils/id.js`

- `1-5`: configures uppercase random ID generator.
- `6-8`: produces order IDs like `ORD_ABC123...`.

### `src/utils/time.js`

- `1-3`: returns `Date.now()`.

## 10) Practical event timeline from `/buy?machineId=M01`

1. Browser requests `/buy?machineId=M01` -> route validates ID -> returns `buy.html`.
2. `buy.js` runs `init()` -> fetches `/machine/status`.
3. Machine simulator already connected via socket and heartbeats are updating RTDB machine state.
4. User clicks **Pay Now** -> browser calls `/orders/create`.
5. Backend validates machine online/not busy -> creates Razorpay order -> writes `orders/{orderId}` with `CREATED`.
6. Browser opens Razorpay modal.
7. Razorpay success callback returns IDs/signature -> browser posts `/payments/verify`.
8. Backend verifies signature and order match -> updates order to `PAID`.
9. Backend emits `machine:dispense` to the specific machine socket.
10. Machine simulates dispense and emits `machine:done`.
11. Backend sets order `COMPLETED` (or `FAILED`) and machine `IDLE`.
12. RTDB now reflects final order and machine states.

## 11) RTDB records touched during this flow

### Machine path
- `machines/M01/status`
- `machines/M01/lastSeenAt`
- `machines/M01/socketConnected`

### Order path
- `orders/ORD_xxxxx/machineId`
- `orders/ORD_xxxxx/amount`
- `orders/ORD_xxxxx/currency`
- `orders/ORD_xxxxx/razorpayOrderId`
- `orders/ORD_xxxxx/razorpayPaymentId`
- `orders/ORD_xxxxx/status`
- `orders/ORD_xxxxx/createdAt`
- `orders/ORD_xxxxx/updatedAt`
- `orders/ORD_xxxxx/failureCode`

## 12) Current known mismatch to be aware of

- `src/web/buy.html:33` hardcodes initial UI text `Rs 20`.
- `src/web/buy.js:11` initializes local default amount to `299`.
- Source of truth is backend response (`/orders/create`), and `buy.js` updates UI to response amount at `154-156`.
- If you want zero UI confusion before click, align those defaults to one value.
