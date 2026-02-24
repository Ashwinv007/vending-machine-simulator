import { rtdbCreateIfAbsent, rtdbGet, rtdbSet, rtdbUpdate } from "../../config/firebase-admin.js";

function paymentEventPath(providerPaymentId) {
  return `paymentEvents/${providerPaymentId}`;
}

export async function getPaymentEvent(providerPaymentId) {
  return rtdbGet(paymentEventPath(providerPaymentId));
}

export async function createPaymentEvent(providerPaymentId, event) {
  await rtdbSet(paymentEventPath(providerPaymentId), event);
}

export async function reservePaymentEvent(providerPaymentId, seedEvent) {
  const result = await rtdbCreateIfAbsent(paymentEventPath(providerPaymentId), seedEvent);
  return {
    reserved: result.created,
    existingEvent: result.created ? null : result.snapshotValue
  };
}

export async function updatePaymentEvent(providerPaymentId, patch) {
  await rtdbUpdate(paymentEventPath(providerPaymentId), patch);
}
