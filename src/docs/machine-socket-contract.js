import { SOCKET_EVENTS } from "../config/constants.js";

export const machineSocketContract = Object.freeze({
  transport: "socket.io",
  namespace: "/",
  protocolVersion: 1,
  connection: {
    description:
      "Machine must connect and immediately authenticate with machine:connect before sending heartbeat or done events.",
    authEvent: SOCKET_EVENTS.CONNECT,
    authPayload: {
      machineId: "M01",
      token: "<machine_token>"
    }
  },
  heartbeat: {
    event: SOCKET_EVENTS.HEARTBEAT,
    payload: {
      machineId: "M01",
      ts: 1730000000000
    },
    recommendation: "Send every 10s. Backend marks machine OFFLINE when heartbeat becomes stale."
  },
  clientToServer: [
    {
      event: SOCKET_EVENTS.CONNECT,
      description: "Authenticates machine identity and binds socket to machineId.",
      payload: {
        machineId: "M01",
        token: "<machine_token>"
      },
      ackSuccess: {
        ok: true,
        machineId: "M01"
      },
      ackFailure: {
        ok: false,
        error: {
          code: "UNAUTHORIZED_MACHINE",
          message: "machine token is invalid"
        }
      }
    },
    {
      event: SOCKET_EVENTS.HEARTBEAT,
      description: "Refreshes machine lastSeenAt and ONLINE presence.",
      payload: {
        machineId: "M01",
        ts: 1730000000000
      },
      ackSuccess: {
        ok: true,
        ts: 1730000000000
      },
      ackFailure: {
        ok: false,
        error: {
          code: "MACHINE_NOT_REGISTERED",
          message: "machine:connect must run first"
        }
      }
    },
    {
      event: SOCKET_EVENTS.DONE,
      description:
        "Reports dispense result for a specific order after machine finishes the action.",
      payload: {
        orderId: "ORD_ABC123",
        result: "SUCCESS"
      },
      ackSuccess: {
        ok: true,
        orderId: "ORD_ABC123"
      },
      ackFailure: {
        ok: false,
        error: {
          code: "MACHINE_DONE_FAILED",
          message: "orderId is required"
        }
      }
    }
  ],
  serverToClient: [
    {
      event: SOCKET_EVENTS.DISPENSE,
      description: "Backend command to start dispense for a paid order.",
      payload: {
        type: "DISPENSE",
        orderId: "ORD_ABC123"
      }
    }
  ],
  orderLifecycle: [
    "Backend emits machine:dispense(orderId)",
    "Machine executes physical dispense",
    "Machine emits machine:done(orderId, SUCCESS|FAILED)",
    "Backend updates orders/{orderId} and machine status"
  ]
});
