import { paymentService } from "./payment.service.js";
import { validatePaymentVerifyPayload } from "../orders/order.validators.js";

export async function verifyPayment(req, res) {
  const validation = validatePaymentVerifyPayload(req.body);

  if (!validation.ok) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: validation.message
      }
    });
  }

  const result = await paymentService.verifyPaymentAndDispatch(req.body);
  return res.status(200).json(result);
}
