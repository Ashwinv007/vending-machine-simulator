import { rtdbPush } from "../../config/firebase-admin.js";

export async function appendLog(machineId, logEntry) {
  const logId = await rtdbPush(`machine_logs/${machineId}`, logEntry);
  return logId;
}
