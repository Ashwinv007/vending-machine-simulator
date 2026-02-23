# MVP Architecture

## Goal
Single backend orchestrator for:
- QR entry
- Razorpay order + verify
- RTDB order state
- Socket command to machine

## Components
- HTTP API (`src/routes` + module controllers)
- Socket.IO machine gateway (`src/modules/machines/machine.socket.js`)
- Order domain (`src/modules/orders`)
- Payment domain (`src/modules/payments`)
- RTDB adapter (`src/config/firebase-admin.js`)

## Runtime flow
1. Machine connects to backend socket and sends heartbeat.
2. Backend mirrors machine status in `machines/{machineId}` in RTDB.
3. User opens `/buy?machineId=M01`, frontend calls `/orders/create`.
4. Backend creates Razorpay order and stores `orders/{orderId}` with `CREATED`.
5. Frontend posts `/payments/verify` after checkout success.
6. Backend verifies signature, marks order `PAID`, emits `machine:dispense`.
7. Machine emits `machine:done` with `SUCCESS` or `FAILED`.
8. Backend marks order `COMPLETED` or `FAILED`, and machine `IDLE`.

## Data model
### machines/{machineId}
- status
- lastSeenAt
- socketConnected

### orders/{orderId}
- machineId
- amount
- currency
- razorpayOrderId
- razorpayPaymentId
- status
- createdAt
- updatedAt
- failureCode
