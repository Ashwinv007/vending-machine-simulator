import dotenv from "dotenv";
import { io } from "socket.io-client";

dotenv.config();

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3000";
const machineId = process.env.MACHINE_ID ?? "M01";
const machineToken = process.env.MACHINE_TOKEN ?? process.env.MACHINE_SHARED_TOKEN ?? "dev-machine-token";
const heartbeatMs = Number(process.env.SIM_HEARTBEAT_MS ?? 10000);
const dispenseDelayMs = Number(process.env.SIM_DISPENSE_DELAY_MS ?? 2000);
const failRate = Number(process.env.SIM_FAIL_RATE ?? 0);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const socket = io(backendUrl, {
  transports: ["websocket"],
  reconnection: true
});

socket.on("connect", () => {
  console.log(`[machine:${machineId}] connected to ${backendUrl}`);

  socket.emit("machine:connect", { machineId, token: machineToken }, (ack) => {
    if (!ack?.ok) {
      console.error(`[machine:${machineId}] connect rejected`, ack?.error);
      return;
    }

    console.log(`[machine:${machineId}] authenticated`);
  });
});

socket.on("disconnect", (reason) => {
  console.log(`[machine:${machineId}] disconnected`, reason);
});

socket.on("machine:dispense", async (payload = {}) => {
  const { orderId } = payload;
  if (!orderId) {
    return;
  }

  console.log(`[machine:${machineId}] DISPENSE order ${orderId}`);
  await wait(dispenseDelayMs);

  const shouldFail = Math.random() < Math.max(0, Math.min(1, failRate));
  const result = shouldFail ? "FAILED" : "SUCCESS";

  socket.emit("machine:done", { orderId, result }, (ack) => {
    if (!ack?.ok) {
      console.error(`[machine:${machineId}] machine:done failed`, ack?.error);
      return;
    }

    console.log(`[machine:${machineId}] order ${orderId} -> ${result}`);
  });
});

setInterval(() => {
  if (!socket.connected) {
    return;
  }

  socket.emit("machine:heartbeat", { machineId, ts: Date.now() });
}, heartbeatMs);

console.log(`[machine:${machineId}] simulator started`);
