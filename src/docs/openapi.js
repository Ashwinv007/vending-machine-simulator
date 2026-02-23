import { MACHINE_STATUS, ORDER_STATUS } from "../config/constants.js";
import { env } from "../config/env.js";
import { machineSocketContract } from "./machine-socket-contract.js";

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Vending Machine MVP API",
      version: "1.0.0",
      description:
        "HTTP API contract for QR -> Node -> Razorpay -> RTDB -> Socket machine flow. Includes machine socket contract for IoT integration."
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
      { name: "Machines", description: "Machine presence and socket integration contract." }
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
          summary: "Create payment order",
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
          summary: "Verify Razorpay payment and dispatch machine",
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
          summary: "Socket.IO machine contract for IoT client",
          description:
            "Canonical event contract for machine firmware/simulator integration. Use this for event names, payloads, and ack formats.",
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
        MachineSocketContract: {
          type: "object",
          description: "Socket.IO event contract used by machine clients."
        }
      }
    },
    "x-machine-socket-events": machineSocketContract
  };
}
