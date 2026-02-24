# MVP Architecture

## Goal
Single backend orchestrator for:
- Printed UPI QR scanner payments
- Razorpay webhook verification
- RTDB order state
- Socket command to machine

## Components
- HTTP API (`src/routes` + module controllers)
- Swagger/OpenAPI docs (`/docs`, `/openapi.json`)
- Socket.IO machine gateway (`src/modules/machines/machine.socket.js`)
- Order domain (`src/modules/orders`)
- Payment domain (`src/modules/payments`)
- RTDB adapter (`src/config/firebase-admin.js`)

## Runtime flow
1. Machine connects to backend socket and sends heartbeat.
2. Backend mirrors machine status in `machines/{machineId}` in RTDB.
3. Customer scans printed UPI QR with GPay/PhonePe and pays fixed amount.
4. Razorpay sends webhook (`/webhooks/razorpay`) to backend.
5. Backend verifies webhook signature and maps `qrCodeId -> machineId`.
6. Backend creates paid order and tries `machine:dispense`.
7. If machine offline/busy, order stays queued as `PAID` (`dispatchPending=true`).
8. On machine connect/heartbeat/idle, backend drains pending queue and dispatches next order.
9. Machine emits `machine:done` with `SUCCESS` or `FAILED`.
10. Backend marks order `COMPLETED` or `FAILED`, and machine `IDLE`.

## Provisioning flow (one-time per machine)
1. Run `npm run qr:provision -- M01,M02`.
2. Script creates Razorpay fixed-amount reusable UPI QR per machine.
3. Script stores:
   - `machines/{machineId}/paymentProfile/*`
   - `qrCodeToMachine/{qrCodeId} = machineId`
4. Script saves printable QR image to `qr/{machineId}.png`.

## Simulator
- Backend and simulator are separate projects.
- Backend code lives in the repository root.
- Machine simulator lives in `machine-simulator/` with its own `.env`.

## Data model
### machines/{machineId}
- status
- lastSeenAt
- socketConnected
- paymentProfile/{provider, qrCodeId, qrImageUrl, qrShortUrl, fixedAmountPaise}

### qrCodeToMachine/{qrCodeId}
- machineId

### paymentEvents/{providerPaymentId}
- status
- reason
- machineId
- orderId
- dispatch
- processedAt

### orders/{orderId}
- machineId
- amount
- currency
- razorpayOrderId
- razorpayPaymentId
- source
- provider
- providerPaymentId
- providerQrCodeId
- paidAt
- dispatchPending
- status
- createdAt
- updatedAt
- failureCode
