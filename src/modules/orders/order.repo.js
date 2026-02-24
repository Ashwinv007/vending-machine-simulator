import { rtdbGet, rtdbSet, rtdbUpdate } from "../../config/firebase-admin.js";
import { ORDER_STATUS } from "../../config/constants.js";

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

export async function listOrders() {
  const orders = await rtdbGet("orders");
  return orders ?? {};
}

export async function findPendingPaidOrder(machineId) {
  const orders = await listOrders();

  const pending = Object.entries(orders)
    .filter(([, order]) => {
      if (!order || typeof order !== "object") {
        return false;
      }

      return (
        order.machineId === machineId &&
        order.status === ORDER_STATUS.PAID &&
        order.dispatchPending === true
      );
    })
    .sort((a, b) => {
      const aCreated = Number(a[1]?.createdAt ?? 0);
      const bCreated = Number(b[1]?.createdAt ?? 0);
      return aCreated - bCreated;
    });

  if (pending.length === 0) {
    return null;
  }

  const [orderId, order] = pending[0];
  return { orderId, order };
}
