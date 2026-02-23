import { MACHINE_STATUS } from "../../config/constants.js";
import { isValidMachineId } from "../orders/order.validators.js";
import { machineService } from "./machine.service.js";

export async function getMachineStatus(req, res) {
  const { machineId } = req.query;

  if (!isValidMachineId(machineId)) {
    return res.status(400).json({
      error: {
        code: "INVALID_MACHINE_ID",
        message: "machineId must be an alphanumeric id like M01"
      }
    });
  }

  const machine = await machineService.getMachineStatus(machineId);

  if (!machine) {
    return res.status(200).json({
      machineId,
      status: MACHINE_STATUS.OFFLINE,
      lastSeenAt: null,
      socketConnected: false
    });
  }

  return res.status(200).json({
    machineId,
    status: machine.status ?? MACHINE_STATUS.OFFLINE,
    lastSeenAt: machine.lastSeenAt ?? null,
    socketConnected: Boolean(machine.socketConnected)
  });
}
