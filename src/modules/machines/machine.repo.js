import { MACHINE_STATUS } from "../../config/constants.js";
import { rtdbGet, rtdbSet, rtdbUpdate } from "../../config/firebase-admin.js";
import { nowMs } from "../../utils/time.js";

function machinePath(machineId) {
  return `machines/${machineId}`;
}

function qrCodePath(qrCodeId) {
  return `qrCodeToMachine/${qrCodeId}`;
}

export async function markMachineConnected(machineId) {
  const ts = nowMs();
  await rtdbUpdate(machinePath(machineId), {
    status: MACHINE_STATUS.ONLINE,
    lastSeenAt: ts,
    socketConnected: true
  });
}

export async function touchMachine(machineId) {
  await rtdbUpdate(machinePath(machineId), {
    lastSeenAt: nowMs(),
    socketConnected: true
  });
}

export async function markMachineDisconnected(machineId) {
  await rtdbUpdate(machinePath(machineId), {
    status: MACHINE_STATUS.OFFLINE,
    lastSeenAt: nowMs(),
    socketConnected: false
  });
}

export async function setMachineStatus(machineId, status, socketConnected = true) {
  await rtdbUpdate(machinePath(machineId), {
    status,
    lastSeenAt: nowMs(),
    socketConnected
  });
}

export async function getMachine(machineId) {
  return rtdbGet(machinePath(machineId));
}

export async function setMachinePaymentProfile(machineId, profile) {
  await rtdbUpdate(machinePath(machineId), {
    paymentProfile: profile
  });
}

export async function mapQrCodeToMachine(qrCodeId, machineId) {
  await rtdbSet(qrCodePath(qrCodeId), machineId);
}

export async function getMachineIdByQrCodeId(qrCodeId) {
  return rtdbGet(qrCodePath(qrCodeId));
}
