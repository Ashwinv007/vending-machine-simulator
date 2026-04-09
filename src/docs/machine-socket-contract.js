import { LOG_LEVELS, MACHINE_STATUS, SOCKET_EVENTS } from "../config/constants.js";

export const machineSocketContract = Object.freeze({
  transport: "socket.io",
  namespace: "/",
  protocolVersion: 1,

  // ─── Transport ────────────────────────────────────────────────────────────

  transportGuidance: {
    recommended: "websocket",
    warning:
      "Socket.IO clients default to HTTP long-polling first, then attempt a WebSocket upgrade. " +
      "On constrained hardware the upgrade may never complete, leaving the device on polling. " +
      "Polling creates overlapping connections, delayed disconnect detection, and higher bandwidth usage. " +
      "Always force WebSocket-only on IoT firmware.",
    clientConfig: {
      transports: ["websocket"]
    },
    pollingVsWebsocket: {
      polling: {
        disconnectDetection: "Delayed — server only knows when the next poll does not arrive",
        serverPush: "Impossible — machine:dispense cannot be pushed; machine must poll to discover it",
        overhead: "High — new HTTP request every few seconds even when idle"
      },
      websocket: {
        disconnectDetection: "Immediate — TCP close fires on both sides instantly",
        serverPush: "Native — machine:dispense delivered in <100ms",
        overhead: "Low — single persistent TCP connection, frames only"
      }
    }
  },

  // ─── Authentication ────────────────────────────────────────────────────────

  authentication: {
    description:
      "Static token-based authentication. The same token is used for both the Socket.IO handshake " +
      "and the HTTP log endpoint. Tokens are configured server-side via environment variables.",
    tokenResolution:
      "Per-machine token (MACHINE_TOKENS_JSON[machineId]) takes priority. " +
      "Falls back to shared token (MACHINE_SHARED_TOKEN). " +
      "Default shared token in development: dev-machine-token",
    socketUsage: "Send token in the machine:connect event payload (see clientToServer[0])",
    httpUsage: "Send token in the x-machine-token request header for POST /machine/logs"
  },

  // ─── Connection Sequence ──────────────────────────────────────────────────

  connectionSequence: [
    "1. Device establishes Socket.IO WebSocket connection (force transports: ['websocket'])",
    "2. Server immediately emits machine:welcome → device receives { ts, socketId }",
    "3. Device emits machine:connect → { machineId, token }",
    "4. Server validates token: if invalid → ack { ok: false } + socket.disconnect(true)",
    "5. Server ack → { ok: true, machineId } + emits machine:authenticated → { ok: true, machineId, ts }",
    "6. Server checks for any queued paid orders and dispatches the oldest one if found",
    "7. Device starts sending machine:heartbeat every 10s",
    "8. Device listens for machine:dispense at all times — it can arrive at any moment after step 5"
  ],

  reconnectionGuidance: {
    description:
      "The server handles reconnections gracefully. When a new socket authenticates for a machineId " +
      "that already has an active socket, the old socket is silently evicted from the registry. " +
      "Any queued orders are re-dispatched on every successful reconnect.",
    recommendation: "Implement exponential backoff: start at 1s, double each attempt, cap at 30s.",
    onReconnect:
      "Always re-send machine:connect — socket.data is reset on every new connection. " +
      "Do NOT assume the previous session's authentication carries over."
  },

  // ─── Heartbeat Monitor ────────────────────────────────────────────────────

  heartbeatMonitor: {
    description:
      "The server runs a background interval that scans all connected machines. " +
      "Any machine whose last heartbeat is older than the timeout threshold is marked OFFLINE " +
      "and removed from the in-memory registry. Queued orders will not be dispatched to OFFLINE machines.",
    timeoutMs: 30000,
    checkIntervalMs: 5000,
    recommendation: "Send machine:heartbeat every 10s to stay well within the 30s timeout window.",
    onTimeout: [
      "Machine removed from in-memory registry",
      "RTDB machines/{machineId}.status set to OFFLINE",
      "RTDB machines/{machineId}.socketConnected set to false",
      "Pending paid orders remain queued — they will be dispatched when the machine reconnects"
    ]
  },

  // ─── Client → Server Events ───────────────────────────────────────────────

  clientToServer: [
    {
      event: SOCKET_EVENTS.CONNECT,
      description:
        "Authenticates the machine and binds the socket to a machineId. " +
        "Must be the first event sent after connection. " +
        "On failure the socket is forcibly disconnected.",
      payload: {
        machineId: "M01",
        token: "<machine_token>"
      },
      validationRules: {
        machineId: "Required. Pattern: ^[A-Za-z0-9_-]{2,32}$",
        token: "Required. Must match per-machine or shared token configured on server."
      },
      ackSuccess: {
        ok: true,
        machineId: "M01"
      },
      ackFailure: {
        ok: false,
        error: {
          code: "<error_code>",
          message: "<description>"
        }
      },
      errorCodes: {
        INVALID_MACHINE_ID: "machineId is missing or does not match pattern ^[A-Za-z0-9_-]{2,32}$",
        UNAUTHORIZED_MACHINE: "token does not match the configured token for this machineId",
        MACHINE_CONNECT_FAILED: "unexpected server error during authentication"
      },
      sideEffectsOnSuccess: [
        "socket.data.machineId set to authenticated machineId",
        "Machine registered in in-memory registry (machineId ↔ socketId)",
        "RTDB machines/{machineId} updated: { status: ONLINE, lastSeenAt, socketConnected: true }",
        "Any queued PAID orders checked and oldest one dispatched if machine is available"
      ]
    },
    {
      event: SOCKET_EVENTS.HEARTBEAT,
      description:
        "Refreshes the machine's last-seen timestamp to prevent being marked OFFLINE. " +
        "The server also checks for queued orders on every heartbeat and dispatches if machine is idle.",
      payload: {},
      note: "Payload is ignored by the server. Send an empty object or omit entirely.",
      ackSuccess: {
        ok: true,
        ts: 1730000000000
      },
      ackFailure: {
        ok: false,
        error: {
          code: "<error_code>",
          message: "<description>"
        }
      },
      errorCodes: {
        MACHINE_NOT_REGISTERED:
          "socket.data.machineId is not set — machine:connect was not called or auth failed",
        HEARTBEAT_FAILED: "unexpected server error"
      },
      sideEffectsOnSuccess: [
        "Registry entry lastSeenAt updated to Date.now()",
        "RTDB machines/{machineId} updated: { lastSeenAt, socketConnected: true }",
        "Any queued PAID orders checked and oldest one dispatched if machine is idle"
      ]
    },
    {
      event: SOCKET_EVENTS.DONE,
      description:
        "Reports the result of a dispense cycle. Must be sent after every machine:dispense command, " +
        "regardless of whether the dispense succeeded or failed. " +
        "Failing to send this leaves the order stuck in DISPENSING state indefinitely.",
      payload: {
        orderId: "ORD_ABC123",
        result: "SUCCESS"
      },
      validationRules: {
        orderId: "Required. Must be a non-empty string matching a known order.",
        result:
          "Any string. Only 'SUCCESS' marks the order COMPLETED. Any other value marks it FAILED with code DISPENSE_FAILED."
      },
      ackSuccess: {
        ok: true,
        orderId: "ORD_ABC123"
      },
      ackFailure: {
        ok: false,
        error: {
          code: "<error_code>",
          message: "<description>"
        }
      },
      errorCodes: {
        MACHINE_NOT_REGISTERED: "socket not authenticated — send machine:connect first",
        INVALID_ORDER_ID: "orderId is missing or not a string",
        MACHINE_DONE_FAILED: "unexpected server error"
      },
      sideEffectsOnSuccess: [
        "If result === 'SUCCESS': RTDB orders/{orderId}.status set to COMPLETED",
        "If result !== 'SUCCESS': RTDB orders/{orderId}.status set to FAILED, failureCode set to DISPENSE_FAILED",
        "RTDB orders/{orderId}.dispatchPending set to false",
        "RTDB machines/{machineId}.status set to IDLE",
        "Next queued PAID order dispatched if any exists"
      ],
      critical:
        "This event is idempotent — sending it twice for the same orderId is safe and will not double-count.",
      serverBehavior:
        "The server does NOT actively wait or timeout for machine:done after sending machine:dispense. " +
        "It simply listens. If machine:done is never received (e.g. firmware crash, power loss), " +
        "the order stays in DISPENSING state indefinitely and NO further orders will be dispatched to this machine. " +
        "The device MUST implement a hardware-level watchdog: if the dispense cycle exceeds a reasonable duration " +
        "without completing, automatically emit machine:done with result: 'FAILED' to unblock the queue. " +
        "Manual recovery: update the order status directly in Firebase RTDB if the device cannot recover."
    }
  ],

  // ─── Server → Client Events ───────────────────────────────────────────────

  serverToClient: [
    {
      event: SOCKET_EVENTS.WELCOME,
      description:
        "Emitted immediately when the socket connects, before authentication. " +
        "Useful for confirming connectivity and capturing the assigned socketId for debugging.",
      payload: {
        ts: 1730000000000,
        socketId: "<socket_id>"
      },
      noAckExpected: true
    },
    {
      event: SOCKET_EVENTS.AUTHENTICATED,
      description:
        "Emitted after machine:connect succeeds. Signals that the machine is fully registered " +
        "and ready to receive dispense commands.",
      payload: {
        ok: true,
        machineId: "M01",
        ts: 1730000000000
      },
      noAckExpected: true
    },
    {
      event: SOCKET_EVENTS.DISPENSE,
      description:
        "Server command to execute a physical dispense for a confirmed paid order. " +
        "Triggered automatically after payment is verified via Razorpay webhook. " +
        "No acknowledgment is expected by the server — respond with machine:done when the cycle completes.",
      payload: {
        type: "DISPENSE",
        orderId: "ORD_ABC123"
      },
      noAckExpected: true,
      machineResponsibilities: [
        "Acquire hardware lock — reject or queue if already dispensing",
        "Execute physical dispense (motor, relay, sensor, etc.)",
        "Record the orderId in non-volatile memory in case of power loss mid-cycle",
        "Emit machine:done with the same orderId when the cycle finishes (success or failure)",
        "Never emit machine:done SUCCESS unless product was physically dispensed"
      ],
      reDeliveryWarning:
        "If the machine disconnects and reconnects while a dispense command was in-flight, " +
        "the server will NOT re-send machine:dispense for an order already in DISPENSING state. " +
        "The machine must emit machine:done for that orderId after reconnecting to unblock the queue."
    }
  ],

  // ─── Full Payment → Dispense Lifecycle ───────────────────────────────────

  orderLifecycle: {
    summary: [
      "1. Customer scans printed UPI QR code and pays",
      "2. Razorpay sends webhook to POST /webhooks/razorpay",
      "3. Server verifies HMAC-SHA256 signature",
      "4. Server creates order in RTDB with status PAID",
      "5. Server emits machine:dispense → { type: 'DISPENSE', orderId } to the machine",
      "6. Machine executes physical dispense",
      "7. Machine emits machine:done → { orderId, result: 'SUCCESS' | 'FAILED' }",
      "8. Server marks order COMPLETED or FAILED",
      "9. Server sets machine status to IDLE",
      "10. Server dispatches next queued order if any exists"
    ],
    ifMachineOfflineAtPayment: [
      "Order is created in RTDB with status PAID and dispatchPending: true",
      "Webhook response returns dispatch: 'QUEUED'",
      "Order waits in RTDB indefinitely — it will not expire",
      "When machine reconnects and sends machine:connect or machine:heartbeat, server auto-dispatches"
    ],
    orderQueueBehavior:
      "Orders are dispatched FIFO (oldest paid order first). " +
      "Only one order is dispatched at a time — the next order is sent only after machine:done is received."
  },

  // ─── Machine Status State Machine ─────────────────────────────────────────

  machineStatus: {
    states: Object.values(MACHINE_STATUS),
    transitions: [
      { from: "any",        to: MACHINE_STATUS.ONLINE,     trigger: "machine:connect success" },
      { from: MACHINE_STATUS.ONLINE,     to: MACHINE_STATUS.DISPENSING, trigger: "server sends machine:dispense" },
      { from: MACHINE_STATUS.DISPENSING, to: MACHINE_STATUS.IDLE,       trigger: "machine:done received (success or failure)" },
      { from: MACHINE_STATUS.IDLE,       to: MACHINE_STATUS.DISPENSING, trigger: "next queued order dispatched" },
      { from: "any",        to: MACHINE_STATUS.OFFLINE,    trigger: "socket disconnect or heartbeat timeout (30s)" }
    ],
    rtdbPath: "machines/{machineId}",
    rtdbSchema: {
      status: `One of: ${Object.values(MACHINE_STATUS).join(", ")}`,
      lastSeenAt: "Unix timestamp (ms) of last heartbeat or connection event",
      socketConnected: "Boolean — false when OFFLINE"
    }
  },

  // ─── HTTP Log Endpoint ────────────────────────────────────────────────────

  logEndpoint: {
    method: "POST",
    path: "/machine/logs",
    description:
      "Ships a single structured log entry to the server. Call this on every significant event. " +
      "One request per log entry — no batching.",
    authHeader: "x-machine-token",
    requiredFields: ["machineId", "level", "event", "ts"],
    optionalFields: ["message", "orderId", "data"],
    levels: Object.values(LOG_LEVELS),
    suggestedEvents: [
      "BOOT", "CONNECT", "DISCONNECT", "HEARTBEAT_FAIL",
      "DISPENSE_START", "DISPENSE_SUCCESS", "DISPENSE_FAILED",
      "MOTOR_JAM", "LOW_STOCK", "DOOR_OPEN", "WATCHDOG_RESET"
    ],
    exampleRequest: {
      machineId: "M01",
      level: LOG_LEVELS.ERROR,
      event: "MOTOR_JAM",
      ts: 1730000000000,
      message: "Slot 3 motor stalled after 3s",
      orderId: "ORD_ABC123",
      data: { slot: 3, retryCount: 2 }
    },
    exampleResponse: {
      ok: true,
      logId: "-NyABC123xyzXXXX"
    },
    rtdbPath: "machine_logs/{machineId}/{pushId}",
    serverAddsField: "serverTs (unix ms) — always stamped server-side, never from request body"
  },

  // ─── Error Codes Reference ────────────────────────────────────────────────

  errorCodes: {
    socket: {
      INVALID_MACHINE_ID:
        "machineId does not match pattern ^[A-Za-z0-9_-]{2,32}$ — check format (e.g. M01, machine_01)",
      UNAUTHORIZED_MACHINE: "token is wrong — check MACHINE_TOKENS_JSON or MACHINE_SHARED_TOKEN on server",
      MACHINE_NOT_REGISTERED:
        "Sent heartbeat or done before machine:connect — always authenticate first",
      INVALID_ORDER_ID: "orderId missing or not a string in machine:done payload"
    },
    http: {
      MISSING_TOKEN: "x-machine-token header not present on POST /machine/logs",
      UNAUTHORIZED_MACHINE: "x-machine-token value is wrong on POST /machine/logs",
      INVALID_REQUEST: "Required field missing or failed validation on POST /machine/logs"
    }
  },

  // ─── Testing Checklist ────────────────────────────────────────────────────

  testingChecklist: [
    "[ ] Connect with transports: ['websocket'] — confirm no polling fallback",
    "[ ] Receive machine:welcome immediately on connect",
    "[ ] Send machine:connect — receive ack { ok: true } and machine:authenticated event",
    "[ ] Send machine:heartbeat every 10s — receive ack { ok: true, ts }",
    "[ ] Trigger a test payment — receive machine:dispense within 500ms",
    "[ ] Send machine:done with result: SUCCESS — receive ack { ok: true, orderId }",
    "[ ] Verify order status at GET /orders/{orderId} shows COMPLETED",
    "[ ] Disconnect for 35s, reconnect — confirm server marks OFFLINE then ONLINE again",
    "[ ] Trigger payment while offline — reconnect and confirm machine:dispense is delivered",
    "[ ] Send machine:done with result: FAILED — verify order shows FAILED in RTDB",
    "[ ] POST /machine/logs for each level: info, warn, error, debug — each returns 201 + logId",
    "[ ] POST /machine/logs without x-machine-token — expect 401 MISSING_TOKEN",
    "[ ] POST /machine/logs with wrong token — expect 401 UNAUTHORIZED_MACHINE"
  ]
});
