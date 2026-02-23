import { rtdbGet, rtdbSet, rtdbUpdate } from "../../config/firebase-admin.js";

function orderPath(orderId) {
  return `orders/${orderId}`;
}

export async function createOrder(orderId, order) {
  await rtdbSet(orderPath(orderId), order);
}

export async function getOrder(orderId) {
  return rtdbGet(orderPath(orderId));
}

export async function updateOrder(orderId, patch) {
  await rtdbUpdate(orderPath(orderId), patch);
}
