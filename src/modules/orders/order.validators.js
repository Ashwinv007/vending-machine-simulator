export function isValidMachineId(machineId) {
  if (typeof machineId !== "string") {
    return false;
  }

  return /^[A-Za-z0-9_-]{2,32}$/.test(machineId);
}

export function validateOrderCreatePayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "request body is required" };
  }

  if (!isValidMachineId(body.machineId)) {
    return {
      ok: false,
      message: "machineId must be an alphanumeric id like M01"
    };
  }

  return { ok: true };
}

export function validatePaymentVerifyPayload(body) {
  const required = [
    "orderId",
    "razorpay_order_id",
    "razorpay_payment_id",
    "razorpay_signature"
  ];

  for (const field of required) {
    if (!body || typeof body[field] !== "string" || body[field].trim().length === 0) {
      return {
        ok: false,
        message: `${field} is required`
      };
    }
  }

  return { ok: true };
}
