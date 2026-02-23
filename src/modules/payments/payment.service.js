import { ORDER_STATUS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import { machineService } from "../machines/machine.service.js";
import * as orderRepo from "../orders/order.repo.js";
import { orderService } from "../orders/order.service.js";
import { verifyRazorpaySignature } from "./signature.js";

class PaymentService {
  async verifyPaymentAndDispatch(payload) {
    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature
    } = payload;

    const order = await orderService.getOrderOrThrow(orderId);

    if (order.razorpayOrderId !== razorpayOrderId) {
      throw new AppError(400, "ORDER_MISMATCH", "razorpay_order_id does not match this order");
    }

    const signatureValid = verifyRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      razorpaySecret: env.RAZORPAY_KEY_SECRET
    });

    if (!signatureValid) {
      throw new AppError(400, "INVALID_SIGNATURE", "Payment signature verification failed");
    }

    if (
      order.razorpayPaymentId &&
      order.razorpayPaymentId !== razorpayPaymentId &&
      order.status !== ORDER_STATUS.CREATED
    ) {
      throw new AppError(409, "PAYMENT_ID_CONFLICT", "Order already tied to a different payment id");
    }

    if (order.status === ORDER_STATUS.COMPLETED || order.status === ORDER_STATUS.DISPENSING) {
      return {
        orderId,
        status: order.status,
        dispatch: "SENT"
      };
    }

    if (order.status !== ORDER_STATUS.PAID) {
      await orderService.markPaid(orderId, razorpayPaymentId);
    }

    const refreshedOrder = await orderRepo.getOrder(orderId);
    const sent = await machineService.dispatchDispense(refreshedOrder.machineId, {
      type: "DISPENSE",
      orderId
    });

    if (sent) {
      await orderService.markDispensing(orderId);
    }

    return {
      orderId,
      status: sent ? ORDER_STATUS.DISPENSING : ORDER_STATUS.PAID,
      dispatch: sent ? "SENT" : "PENDING"
    };
  }
}

export const paymentService = new PaymentService();
