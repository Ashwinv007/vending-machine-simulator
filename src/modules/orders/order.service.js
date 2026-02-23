import { MACHINE_STATUS, ORDER_STATUS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import { razorpayClient } from "../../config/razorpay.js";
import { AppError } from "../../utils/app-error.js";
import { generateOrderId } from "../../utils/id.js";
import { nowMs } from "../../utils/time.js";
import { machineService } from "../machines/machine.service.js";
import * as orderRepo from "./order.repo.js";
import { isValidMachineId } from "./order.validators.js";

function buildOrderRecord({ orderId, machineId, razorpayOrderId }) {
  const ts = nowMs();
  return {
    machineId,
    amount: env.ORDER_AMOUNT_INR,
    currency: env.ORDER_CURRENCY,
    razorpayOrderId,
    razorpayPaymentId: null,
    status: ORDER_STATUS.CREATED,
    createdAt: ts,
    updatedAt: ts,
    failureCode: null
  };
}

async function createRazorpayOrder(orderId, machineId) {
  try {
    return await razorpayClient.orders.create({
      amount: env.ORDER_AMOUNT_INR * 100,
      currency: env.ORDER_CURRENCY,
      receipt: orderId,
      notes: {
        machineId,
        appOrderId: orderId
      }
    });
  } catch (error) {
    const fallback = "Unable to create Razorpay order";
    const providerMessage =
      typeof error?.error?.description === "string"
        ? error.error.description
        : typeof error?.description === "string"
          ? error.description
          : typeof error?.message === "string"
            ? error.message
            : fallback;

    throw new AppError(502, "RAZORPAY_ORDER_CREATE_FAILED", providerMessage);
  }
}

async function updateStatus(orderId, status, patch = {}) {
  await orderRepo.updateOrder(orderId, {
    status,
    updatedAt: nowMs(),
    ...patch
  });
}

class OrderService {
  async createOrder(machineId) {
    if (!isValidMachineId(machineId)) {
      throw new AppError(400, "INVALID_MACHINE_ID", "machineId must be an alphanumeric id like M01");
    }

    const machineOnline = await machineService.isMachineOnline(machineId);
    if (!machineOnline) {
      throw new AppError(409, "MACHINE_OFFLINE", "Machine is offline");
    }

    const machine = await machineService.getMachineStatus(machineId);
    if (machine?.status === MACHINE_STATUS.DISPENSING) {
      throw new AppError(409, "MACHINE_BUSY", "Machine is currently dispensing another order");
    }

    const orderId = generateOrderId();
    const razorpayOrder = await createRazorpayOrder(orderId, machineId);

    const orderRecord = buildOrderRecord({
      orderId,
      machineId,
      razorpayOrderId: razorpayOrder.id
    });

    await orderRepo.createOrder(orderId, orderRecord);

    return {
      orderId,
      machineId,
      amount: orderRecord.amount,
      currency: orderRecord.currency,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: env.RAZORPAY_KEY_ID
    };
  }

  async getOrderOrThrow(orderId) {
    const order = await orderRepo.getOrder(orderId);
    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    return order;
  }

  async markPaid(orderId, razorpayPaymentId) {
    await updateStatus(orderId, ORDER_STATUS.PAID, {
      razorpayPaymentId,
      failureCode: null
    });
  }

  async markDispensing(orderId) {
    await updateStatus(orderId, ORDER_STATUS.DISPENSING);
  }

  async markCompleted(orderId) {
    const order = await this.getOrderOrThrow(orderId);

    if (order.status === ORDER_STATUS.COMPLETED) {
      return;
    }

    await updateStatus(orderId, ORDER_STATUS.COMPLETED, {
      failureCode: null
    });
  }

  async markFailed(orderId, failureCode) {
    const order = await this.getOrderOrThrow(orderId);

    if (order.status === ORDER_STATUS.FAILED) {
      return;
    }

    await updateStatus(orderId, ORDER_STATUS.FAILED, {
      failureCode
    });
  }
}

export const orderService = new OrderService();
