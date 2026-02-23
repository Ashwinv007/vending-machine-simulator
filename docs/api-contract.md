# API Contract

Swagger UI:
- `GET /docs`
- Raw OpenAPI JSON: `GET /openapi.json`
- Export file for sharing: `npm run docs:export` (writes `docs/openapi.json`)

## POST /orders/create
Request
```json
{ "machineId": "M01" }
```

Response `201`
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "machineId": "M01",
  "amount": 299,
  "currency": "INR",
  "razorpayOrderId": "order_xxx",
  "razorpayKeyId": "rzp_test_xxx"
}
```

Errors
- `400 INVALID_REQUEST`
- `409 MACHINE_OFFLINE`

## POST /payments/verify
Request
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "sig_xxx"
}
```

Response `200`
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "status": "PAID",
  "dispatch": "PENDING"
}
```
or
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "status": "DISPENSING",
  "dispatch": "SENT"
}
```

Errors
- `400 INVALID_REQUEST`
- `400 INVALID_SIGNATURE`
- `404 ORDER_NOT_FOUND`

## GET /machine/status?machineId=M01
Response `200`
```json
{
  "machineId": "M01",
  "status": "ONLINE",
  "lastSeenAt": 1730000000000,
  "socketConnected": true
}
```

## GET /machine/socket-contract
Response `200`
```json
{
  "transport": "socket.io",
  "namespace": "/",
  "protocolVersion": 1
}
```

## GET /orders/:orderId
Response `200`
```json
{
  "orderId": "ORD_XXXXXXXXXX",
  "machineId": "M01",
  "status": "DISPENSING",
  "amount": 299,
  "currency": "INR",
  "failureCode": null,
  "updatedAt": 1730000000000
}
```

## GET /buy?machineId=M01
Returns HTML page.

## Socket events
Client -> Server
- `machine:connect` `{ machineId, token }`
- `machine:heartbeat` `{ machineId, ts }`
- `machine:done` `{ orderId, result: "SUCCESS" | "FAILED" }`

Server -> Client
- `machine:dispense` `{ type: "DISPENSE", orderId }`
