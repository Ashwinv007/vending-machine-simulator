import { asyncHandler } from "../../utils/async-handler.js";
import { machineLogService } from "./machine-log.service.js";

export const storeMachineLog = asyncHandler(async (req, res) => {
  const validation = machineLogService.validatePayload(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: validation.message } });
  }

  const token = req.headers["x-machine-token"];
  if (!token) {
    return res.status(401).json({ error: { code: "MISSING_TOKEN", message: "x-machine-token header is required" } });
  }

  machineLogService.authenticateOrThrow(req.body.machineId, token);

  const logId = await machineLogService.storeLog(req.body);
  return res.status(201).json({ ok: true, logId });
});
