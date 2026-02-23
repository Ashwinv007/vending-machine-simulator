import { orderService } from "./order.service.js";
import { validateOrderCreatePayload } from "./order.validators.js";

export async function createOrder(req, res) {
  const validation = validateOrderCreatePayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: validation.message
      }
    });
  }

  const result = await orderService.createOrder(req.body.machineId);
  return res.status(201).json(result);
}

export async function getOrderById(req, res) {
  const { orderId } = req.params;

  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({
      error: {
        code: "INVALID_ORDER_ID",
        message: "orderId path param is required"
      }
    });
  }

  const order = await orderService.getOrderOrThrow(orderId);

  return res.status(200).json({
    orderId,
    machineId: order.machineId,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    failureCode: order.failureCode ?? null,
    updatedAt: order.updatedAt
  });
}
