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
