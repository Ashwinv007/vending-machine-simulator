import { env } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import { nowMs } from "../../utils/time.js";
import * as machineRepo from "../machines/machine.repo.js";
import { orderService } from "../orders/order.service.js";
import * as paymentEventRepo from "./payment-event.repo.js";
import { verifyRazorpayWebhookSignature } from "./signature.js";

const SUPPORTED_EVENTS = new Set(["qr_code.credited", "payment.captured"]);

function extractWebhookEntities(payload = {}) {
  const payment = payload?.payload?.payment?.entity ?? null;
  const qrCode = payload?.payload?.qr_code?.entity ?? null;

  const paymentId = payment?.id ?? null;
  const qrCodeId = qrCode?.id ?? payment?.notes?.qr_code_id ?? null;
  const amountPaise = Number(payment?.amount ?? 0);
  const razorpayOrderId = payment?.order_id ?? null;

  return {
    payment,
    paymentId,
    qrCodeId,
    amountPaise: Number.isFinite(amountPaise) ? amountPaise : 0,
    razorpayOrderId
  };
}

async function persistPaymentEvent(providerPaymentId, event) {
  await paymentEventRepo.updatePaymentEvent(providerPaymentId, {
    ...event,
    processedAt: nowMs(),
    updatedAt: nowMs()
  });
}

class WebhookService {
  async processRazorpayWebhook({ signature, rawBody, payload }) {
    if (!env.UPI_SCANNER_MODE) {
      return {
        ok: true,
        ignored: true,
        reason: "UPI_SCANNER_MODE_DISABLED"
      };
    }

    const signatureValid = verifyRazorpayWebhookSignature({
      rawBody,
      webhookSignature: signature,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET
    });

    if (!signatureValid) {
      throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Razorpay webhook signature verification failed");
    }

    const eventName = payload?.event ?? "";
    if (!SUPPORTED_EVENTS.has(eventName)) {
      return {
        ok: true,
        ignored: true,
        reason: "UNSUPPORTED_EVENT",
        event: eventName
      };
    }

    const { paymentId, qrCodeId, amountPaise, razorpayOrderId } = extractWebhookEntities(payload);

    if (!paymentId) {
      return {
        ok: true,
        ignored: true,
        reason: "MISSING_PAYMENT_ID",
        event: eventName
      };
    }

    const reserved = await paymentEventRepo.reservePaymentEvent(paymentId, {
      status: "PROCESSING",
      reason: "RECEIVED",
      providerPaymentId: paymentId,
      providerQrCodeId: qrCodeId ?? null,
      machineId: null,
      orderId: null,
      dispatch: "NOT_SENT",
      amountPaise,
      event: eventName,
      createdAt: nowMs(),
      updatedAt: nowMs()
    });

    if (!reserved.reserved) {
      const existingEvent = reserved.existingEvent ?? (await paymentEventRepo.getPaymentEvent(paymentId));
      return {
        ok: true,
        idempotent: true,
        paymentId,
        orderId: existingEvent.orderId ?? null,
        dispatch: existingEvent.dispatch ?? "ALREADY_PROCESSED"
      };
    }

    if (!qrCodeId) {
      await persistPaymentEvent(paymentId, {
        status: "REJECTED",
        reason: "MISSING_QR_CODE_ID",
        providerQrCodeId: null,
        machineId: null,
        orderId: null,
        dispatch: "NOT_SENT",
        amountPaise
      });

      return {
        ok: true,
        ignored: true,
        reason: "MISSING_QR_CODE_ID",
        paymentId
      };
    }

    if (amountPaise !== env.ORDER_AMOUNT_PAISE) {
      await persistPaymentEvent(paymentId, {
        status: "REJECTED",
        reason: "INVALID_AMOUNT",
        providerQrCodeId: qrCodeId,
        machineId: null,
        orderId: null,
        dispatch: "NOT_SENT",
        amountPaise
      });

      return {
        ok: true,
        ignored: true,
        reason: "INVALID_AMOUNT",
        paymentId,
        amountPaise
      };
    }

    const machineId = await machineRepo.getMachineIdByQrCodeId(qrCodeId);
    if (!machineId) {
      await persistPaymentEvent(paymentId, {
        status: "REJECTED",
        reason: "UNKNOWN_QR_CODE",
        providerQrCodeId: qrCodeId,
        machineId: null,
        orderId: null,
        dispatch: "NOT_SENT",
        amountPaise
      });

      return {
        ok: true,
        ignored: true,
        reason: "UNKNOWN_QR_CODE",
        paymentId,
        qrCodeId
      };
    }

    const { orderId } = await orderService.createWebhookPaidOrder({
      machineId,
      providerPaymentId: paymentId,
      providerQrCodeId: qrCodeId,
      razorpayOrderId
    });

    const dispatchResult = await orderService.tryDispatchNextPending(machineId);
    const dispatch = dispatchResult.dispatched ? "SENT" : "QUEUED";

    await persistPaymentEvent(paymentId, {
      status: "PROCESSED",
      reason: dispatchResult.reason,
      providerQrCodeId: qrCodeId,
      machineId,
      orderId,
      dispatch,
      amountPaise
    });

    return {
      ok: true,
      paymentId,
      machineId,
      orderId,
      status: dispatchResult.dispatched ? "DISPENSING" : "PAID",
      dispatch
    };
  }
}

export const webhookService = new WebhookService();
