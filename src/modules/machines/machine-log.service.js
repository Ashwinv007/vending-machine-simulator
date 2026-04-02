import { LOG_LEVELS } from "../../config/constants.js";
import { AppError } from "../../utils/app-error.js";
import { nowMs } from "../../utils/time.js";
import { isValidMachineId } from "../orders/order.validators.js";
import { machineService } from "./machine.service.js";
import * as machineLogRepo from "./machine-log.repo.js";

class MachineLogService {
  authenticateOrThrow(machineId, token) {
    if (!machineService.authenticateMachine(machineId, token)) {
      throw new AppError(401, "UNAUTHORIZED_MACHINE", "machine token is invalid");
    }
  }

  validatePayload(body) {
    if (!body || typeof body !== "object") {
      return { ok: false, message: "request body is required" };
    }
    if (!isValidMachineId(body.machineId)) {
      return { ok: false, message: "machineId must be an alphanumeric id like M01" };
    }
    if (!Object.values(LOG_LEVELS).includes(body.level)) {
      return { ok: false, message: `level must be one of: ${Object.values(LOG_LEVELS).join(", ")}` };
    }
    if (!body.event || typeof body.event !== "string" || body.event.trim().length === 0) {
      return { ok: false, message: "event is required and must be a non-empty string" };
    }
    if (!Number.isFinite(body.ts)) {
      return { ok: false, message: "ts must be a finite unix timestamp in milliseconds" };
    }
    return { ok: true };
  }

  async storeLog(body) {
    const { machineId, level, event, ts, message, orderId, data } = body;

    const logEntry = { level, event: event.trim(), ts, serverTs: nowMs() };

    if (typeof message === "string" && message.trim().length > 0) {
      logEntry.message = message.trim();
    }
    if (typeof orderId === "string" && orderId.trim().length > 0) {
      logEntry.orderId = orderId.trim();
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      logEntry.data = data;
    }

    return machineLogRepo.appendLog(machineId, logEntry);
  }
}

export const machineLogService = new MachineLogService();
