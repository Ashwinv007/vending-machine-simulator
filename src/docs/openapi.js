import { LOG_LEVELS, MACHINE_STATUS, ORDER_STATUS } from "../config/constants.js";
import { env } from "../config/env.js";
import { machineSocketContract } from "./machine-socket-contract.js";

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Vending Machine MVP API",
      version: "1.0.0",
      description:
        "HTTP + Socket.IO API for a UPI QR vending machine. " +
        "Full payment flow: customer scans printed QR → Razorpay webhook → order created → machine:dispense sent to IoT device via Socket.IO → machine:done received → order closed. " +
        "See GET /machine/socket-contract for the full IoT Socket.IO event contract including transport guidance, authentication, heartbeat, dispense commands, and testing checklist."
    },
    servers: [
      {
        url: env.PUBLIC_BASE_URL
      }
    ],
    tags: [
      { name: "System", description: "Health and platform metadata." },
      { name: "Checkout", description: "QR entry page for payment flow." },
      { name: "Orders", description: "Order creation and status read APIs." },
      { name: "Payments", description: "Razorpay verify and dispatch APIs." },
      {
        name: "Webhooks",
        description:
          "Provider webhook ingestion. " +
          "POST /webhooks/razorpay is the primary payment path for UPI QR scanner mode. " +
          "On a valid payment, the server creates a PAID order and immediately emits machine:dispense to the IoT device over Socket.IO. " +
          "If the machine is offline, the order is queued and dispatched on next reconnect."
      },
      {
        name: "Machines",
        description:
          "IoT device management. " +
          "GET /machine/status — check if a machine is online. " +
          "POST /machine/logs — ship structured log entries from firmware. " +
          "GET /machine/socket-contract — full Socket.IO event contract (transport, auth, heartbeat, dispense, done, testing checklist)."
      }
    ],
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          responses: {
            200: {
              description: "Backend is alive",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" }
                }
              }
            }
          }
        }
      },
      "/config/public": {
        get: {
          tags: ["System"],
          summary: "Public checkout configuration",
          responses: {
            200: {
              description: "Public config flags and fixed amount",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PublicConfigResponse" }
                }
              }
            }
          }
        }
      },
      "/buy": {
        get: {
          tags: ["Checkout"],
          summary: "Render buy page from QR",
          parameters: [
            {
              name: "machineId",
              in: "query",
              required: true,
              schema: {
                type: "string",
                pattern: "^[A-Za-z0-9_-]{2,32}$"
              },
              example: "M01"
            }
          ],
          responses: {
            200: {
              description: "Checkout HTML page",
              content: {
                "text/html": {
                  schema: { type: "string" }
                }
              }
            },
            400: {
              description: "machineId missing or invalid",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/orders/create": {
        post: {
          tags: ["Orders"],
          summary: "Create payment order (legacy fallback)",
          deprecated: true,
          description:
            "Legacy checkout endpoint retained for rollback. Primary scanner flow uses printed UPI QR and /webhooks/razorpay.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrderCreateRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Order created with Razorpay order id",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OrderCreateResponse" }
                }
              }
            },
            400: {
              description: "Invalid request body",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            409: {
              description: "Machine offline or busy",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/orders/{orderId}": {
        get: {
          tags: ["Orders"],
          summary: "Get current order status",
          parameters: [
            {
              name: "orderId",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "ORD_ABC123"
            }
          ],
          responses: {
            200: {
              description: "Order snapshot",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OrderStatusResponse" }
                }
              }
            },
            404: {
              description: "Order not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/payments/verify": {
        post: {
          tags: ["Payments"],
          summary: "Verify Razorpay payment and dispatch machine (legacy fallback)",
          deprecated: true,
          description:
            "Legacy checkout verification endpoint retained for rollback. Primary scanner flow uses printed UPI QR and /webhooks/razorpay.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaymentVerifyRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Verification result and machine dispatch state",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentVerifyResponse" }
                }
              }
            },
            400: {
              description: "Invalid payload/signature",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            404: {
              description: "Order not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            409: {
              description: "Payment/order conflict",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/webhooks/razorpay": {
        post: {
          tags: ["Webhooks"],
          summary: "Razorpay webhook — payment confirmed, machine:dispense triggered",
          description:
            "Primary payment path for UPI QR scanner mode. " +
            "Verifies X-Razorpay-Signature (HMAC-SHA256). " +
            "On success: creates a PAID order in RTDB, then immediately emits machine:dispense { type: 'DISPENSE', orderId } to the IoT device via Socket.IO. " +
            "If the machine is offline or busy, the order is queued (dispatchPending: true) and dispatched automatically when the machine next connects or heartbeats. " +
            "Supports events: qr_code.credited (primary), payment.captured (fallback). " +
            "Idempotent — duplicate webhooks for the same paymentId are safely ignored.",
          parameters: [
            {
              name: "X-Razorpay-Signature",
              in: "header",
              required: true,
              schema: { type: "string" },
              example: "a6d90f6f5e7c..."
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true
                }
              }
            }
          },
          responses: {
            200: {
              description: "Webhook handled or ignored",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RazorpayWebhookResponse" }
                }
              }
            },
            401: {
              description: "Invalid webhook signature",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/machine/logs": {
        post: {
          tags: ["Machines"],
          summary: "Store a machine log entry",
          description:
            "Called by the machine firmware on every log event. Each request stores a single entry in Firebase RTDB under machine_logs/{machineId}.",
          parameters: [
            {
              name: "x-machine-token",
              in: "header",
              required: true,
              schema: { type: "string" },
              example: "dev-machine-token"
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MachineLogRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Log entry stored",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MachineLogResponse" }
                }
              }
            },
            400: {
              description: "Invalid request body",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            401: {
              description: "Missing or invalid machine token",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/machine/status": {
        get: {
          tags: ["Machines"],
          summary: "Get machine online/offline status",
          parameters: [
            {
              name: "machineId",
              in: "query",
              required: true,
              schema: {
                type: "string",
                pattern: "^[A-Za-z0-9_-]{2,32}$"
              },
              example: "M01"
            }
          ],
          responses: {
            200: {
              description: "Machine state",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MachineStatusResponse" }
                }
              }
            },
            400: {
              description: "Invalid machineId",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/machine/socket-contract": {
        get: {
          tags: ["Machines"],
          summary: "Full Socket.IO contract for IoT firmware",
          description:
            "Canonical integration reference for machine firmware. Covers: " +
            "transport guidance (force WebSocket, avoid polling), " +
            "authentication (token setup, x-machine-token header), " +
            "connection sequence (welcome → connect → authenticated → heartbeat loop), " +
            "all event payloads and ack shapes (machine:connect, machine:heartbeat, machine:done, machine:dispense), " +
            "full payment → dispense order lifecycle, " +
            "machine status state machine (ONLINE / DISPENSING / IDLE / OFFLINE), " +
            "HTTP log endpoint reference (POST /machine/logs), " +
            "error codes for all socket events, " +
            "and a testing checklist.",
          responses: {
            200: {
              description: "Socket contract payload",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MachineSocketContract" },
                  examples: {
                    default: {
                      value: machineSocketContract
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          required: ["ok", "databaseMode", "ts"],
          properties: {
            ok: { type: "boolean", example: true },
            databaseMode: { type: "string", example: "admin" },
            ts: { type: "integer", format: "int64", example: 1730000000000 }
          }
        },
        PublicConfigResponse: {
          type: "object",
          required: ["upiScannerMode", "orderAmountInr", "orderCurrency"],
          properties: {
            upiScannerMode: { type: "boolean", example: true },
            orderAmountInr: { type: "number", example: 20 },
            orderCurrency: { type: "string", example: "INR" }
          }
        },
        ErrorResponse: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", example: "INVALID_REQUEST" },
                message: { type: "string", example: "machineId must be an alphanumeric id like M01" }
              }
            }
          }
        },
        OrderCreateRequest: {
          type: "object",
          required: ["machineId"],
          properties: {
            machineId: { type: "string", example: "M01" }
          }
        },
        OrderCreateResponse: {
          type: "object",
          required: ["orderId", "machineId", "amount", "currency", "razorpayOrderId", "razorpayKeyId"],
          properties: {
            orderId: { type: "string", example: "ORD_ABC123XYZ" },
            machineId: { type: "string", example: "M01" },
            amount: { type: "number", example: 299 },
            currency: { type: "string", example: "INR" },
            razorpayOrderId: { type: "string", example: "order_Q123456789" },
            razorpayKeyId: { type: "string", example: "rzp_test_1234" }
          }
        },
        OrderStatus: {
          type: "string",
          enum: Object.values(ORDER_STATUS),
          example: ORDER_STATUS.DISPENSING
        },
        MachineStatus: {
          type: "string",
          enum: Object.values(MACHINE_STATUS),
          example: MACHINE_STATUS.ONLINE
        },
        OrderStatusResponse: {
          type: "object",
          required: ["orderId", "machineId", "status", "amount", "currency", "failureCode", "updatedAt"],
          properties: {
            orderId: { type: "string", example: "ORD_ABC123XYZ" },
            machineId: { type: "string", example: "M01" },
            status: { $ref: "#/components/schemas/OrderStatus" },
            amount: { type: "number", example: 299 },
            currency: { type: "string", example: "INR" },
            failureCode: {
              type: "string",
              nullable: true,
              example: null
            },
            updatedAt: { type: "integer", format: "int64", example: 1730000000000 }
          }
        },
        PaymentVerifyRequest: {
          type: "object",
          required: ["orderId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature"],
          properties: {
            orderId: { type: "string", example: "ORD_ABC123XYZ" },
            razorpay_order_id: { type: "string", example: "order_Q123456789" },
            razorpay_payment_id: { type: "string", example: "pay_Q123456789" },
            razorpay_signature: { type: "string", example: "abc123signature" }
          }
        },
        PaymentVerifyResponse: {
          type: "object",
          required: ["orderId", "status", "dispatch"],
          properties: {
            orderId: { type: "string", example: "ORD_ABC123XYZ" },
            status: { $ref: "#/components/schemas/OrderStatus" },
            dispatch: {
              type: "string",
              enum: ["SENT", "PENDING"],
              example: "SENT"
            }
          }
        },
        RazorpayWebhookResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
            ignored: { type: "boolean", example: false },
            idempotent: { type: "boolean", example: false },
            reason: { type: "string", example: "SENT" },
            paymentId: { type: "string", example: "pay_Q123456789" },
            machineId: { type: "string", example: "M01" },
            orderId: { type: "string", example: "ORD_ABC123XYZ" },
            status: { $ref: "#/components/schemas/OrderStatus" },
            dispatch: {
              type: "string",
              enum: ["SENT", "QUEUED", "NOT_SENT", "ALREADY_PROCESSED"],
              example: "SENT"
            }
          }
        },
        MachineStatusResponse: {
          type: "object",
          required: ["machineId", "status", "lastSeenAt", "socketConnected"],
          properties: {
            machineId: { type: "string", example: "M01" },
            status: { $ref: "#/components/schemas/MachineStatus" },
            lastSeenAt: {
              type: "integer",
              format: "int64",
              nullable: true,
              example: 1730000000000
            },
            socketConnected: { type: "boolean", example: true }
          }
        },
        MachineLogRequest: {
          type: "object",
          required: ["machineId", "level", "event", "ts"],
          properties: {
            machineId: {
              type: "string",
              pattern: "^[A-Za-z0-9_-]{2,32}$",
              example: "M01"
            },
            level: {
              type: "string",
              enum: Object.values(LOG_LEVELS),
              example: LOG_LEVELS.ERROR
            },
            event: {
              type: "string",
              description: "Free-form event identifier from firmware, e.g. BOOT, MOTOR_JAM, DISPENSE_START",
              example: "MOTOR_JAM"
            },
            ts: {
              type: "integer",
              format: "int64",
              description: "Device clock unix timestamp in milliseconds",
              example: 1743580800000
            },
            message: {
              type: "string",
              description: "Optional human-readable description",
              example: "Slot 3 motor stalled after 3s"
            },
            orderId: {
              type: "string",
              description: "Optional — set when the log is related to a specific order",
              example: "ORD_A1B2C3D4E5"
            },
            data: {
              type: "object",
              description: "Optional flat key-value context. Do not use arrays.",
              example: { slot: 3, retryCount: 2 },
              additionalProperties: true
            }
          }
        },
        MachineLogResponse: {
          type: "object",
          required: ["ok", "logId"],
          properties: {
            ok: { type: "boolean", example: true },
            logId: {
              type: "string",
              description: "Firebase push ID of the stored log entry",
              example: "-NyABC123xyzXXXX"
            }
          }
        },
        MachineSocketContract: {
          type: "object",
          description: "Socket.IO event contract used by machine clients."
        }
      }
    },
    "x-machine-socket-events": machineSocketContract
  };
}
