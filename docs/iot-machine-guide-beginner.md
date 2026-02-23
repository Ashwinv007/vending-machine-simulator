# IoT Machine Integration Guide (Beginner Friendly)

This guide is for the hardware/firmware engineer who connects a vending machine to this backend.

## 1) What you need to build

Your machine firmware only needs to do 4 socket events:

1. `machine:connect` (authenticate machine)
2. `machine:heartbeat` (keep machine online)
3. Receive `machine:dispense` (trigger motor/hardware)
4. `machine:done` (report success/failure)

You do **not** need Razorpay APIs or frontend APIs.

## 2) Server URL

Use this backend URL:

`https://vending-machine-simulator-production.up.railway.app`

This is the Socket.IO server URL.

## 3) Credentials you need from backend team

1. `machineId` (example: `M01`)
2. `machine token` (must match backend token config)

## 4) Event contract (exact)

### A) Machine -> Server: `machine:connect`

Send once after socket connection is established.

```json
{ "machineId": "M01", "token": "dev-machine-token" }
```

Expected ACK success:

```json
{ "ok": true, "machineId": "M01" }
```

If `ok: false`, authentication failed.

### B) Machine -> Server: `machine:heartbeat`

Send every 10 seconds (recommended).

```json
{ "machineId": "M01", "ts": 1730000000000 }
```

Expected ACK success:

```json
{ "ok": true, "ts": 1730000000000 }
```

If heartbeat stops for too long, backend marks machine `OFFLINE`.

### C) Server -> Machine: `machine:dispense`

This is the hardware trigger event.

```json
{ "type": "DISPENSE", "orderId": "ORD_ABC123" }
```

When this arrives:

1. Start your dispense cycle (motor/relay/actuator).
2. Wait for cycle complete.
3. Report result using `machine:done`.

### D) Machine -> Server: `machine:done`

Send after hardware action is finished.

Success:

```json
{ "orderId": "ORD_ABC123", "result": "SUCCESS" }
```

Failure:

```json
{ "orderId": "ORD_ABC123", "result": "FAILED" }
```

Expected ACK success:

```json
{ "ok": true, "orderId": "ORD_ABC123" }
```

## 5) Hardware logic mapping

On `machine:dispense`:

1. Lock machine so another dispense does not start.
2. Run motor / dispensing mechanism.
3. If item released correctly: emit `machine:done` with `SUCCESS`.
4. If jam, timeout, sensor fail: emit `machine:done` with `FAILED`.
5. Unlock machine.

## 6) Minimal Socket.IO client example (Node reference)

Use this as behavior reference for firmware implementation.

```js
import { io } from "socket.io-client";

const socket = io("https://vending-machine-simulator-production.up.railway.app", {
  transports: ["websocket"],
  reconnection: true
});

const machineId = "M01";
const token = "dev-machine-token";

socket.on("connect", () => {
  socket.emit("machine:connect", { machineId, token }, (ack) => {
    if (!ack?.ok) {
      console.error("machine:connect failed", ack?.error);
      return;
    }
    console.log("Machine authenticated");
  });
});

setInterval(() => {
  if (!socket.connected) return;
  socket.emit("machine:heartbeat", { machineId, ts: Date.now() });
}, 10000);

socket.on("machine:dispense", async ({ orderId }) => {
  if (!orderId) return;

  let result = "SUCCESS";
  try {
    // TODO: call real motor/relay/hardware control here.
    await runDispenseCycle();
  } catch {
    result = "FAILED";
  }

  socket.emit("machine:done", { orderId, result }, (ack) => {
    if (!ack?.ok) {
      console.error("machine:done failed", ack?.error);
    }
  });
});

async function runDispenseCycle() {
  // Replace with actual hardware control.
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
```

## 7) Quick test checklist

1. Start backend.
2. Start machine client.
3. Confirm backend shows machine online:
   `GET /machine/status?machineId=M01`
4. Trigger one payment flow from `/buy?machineId=M01`.
5. Confirm machine receives `machine:dispense`.
6. Confirm machine sends `machine:done`.
7. Confirm order status reaches `COMPLETED` (or `FAILED`).

## 8) Debug endpoints

1. Swagger docs:
   `https://vending-machine-simulator-production.up.railway.app/docs`
2. Raw machine socket contract:
   `https://vending-machine-simulator-production.up.railway.app/machine/socket-contract`
3. OpenAPI JSON:
   `https://vending-machine-simulator-production.up.railway.app/openapi.json`

## 9) Common mistakes

1. Wrong token -> `machine:connect` fails.
2. Wrong machineId -> backend rejects machine.
3. Heartbeat not sent -> machine turns `OFFLINE`.
4. Forgetting `machine:done` -> order stuck at `DISPENSING`.
5. Sending `machine:done` without `orderId` -> backend rejects completion.
