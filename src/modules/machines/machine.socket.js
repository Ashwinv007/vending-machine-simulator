import { SOCKET_EVENTS } from "../../config/constants.js";
import { AppError } from "../../utils/app-error.js";
import { orderService } from "../orders/order.service.js";
import { isValidMachineId } from "../orders/order.validators.js";
import { machineService } from "./machine.service.js";

function ack(ackFn, payload) {
  if (typeof ackFn === "function") {
    ackFn(payload);
  }
}

export function registerMachineSocket(io) {
  machineService.attachIo(io);

  io.on("connection", (socket) => {
    console.log(`[server] socket connected: ${socket.id}`);
    socket.emit(SOCKET_EVENTS.WELCOME, { ts: Date.now(), socketId: socket.id });

    socket.on(SOCKET_EVENTS.CONNECT, async (payload = {}, ackFn) => {
      try {
        const { machineId, token } = payload;
        console.log(`[server] machine:connect from ${machineId ?? "unknown"} (socket: ${socket.id})`);

        if (!isValidMachineId(machineId)) {
          throw new AppError(400, "INVALID_MACHINE_ID", "machineId is invalid");
        }

        if (!machineService.authenticateMachine(machineId, token)) {
          throw new AppError(401, "UNAUTHORIZED_MACHINE", "machine token is invalid");
        }

        await machineService.handleConnect(socket, machineId);
        await orderService.tryDispatchNextPending(machineId);
        console.log(`[server] machine ${machineId} authenticated (socket: ${socket.id})`);
        ack(ackFn, { ok: true, machineId });
        socket.emit(SOCKET_EVENTS.AUTHENTICATED, { ok: true, machineId, ts: Date.now() });
      } catch (error) {
        console.error(`[server] machine:connect failed (socket: ${socket.id}):`, error.message);
        ack(ackFn, {
          ok: false,
          error: {
            code: error.code ?? "MACHINE_CONNECT_FAILED",
            message: error.message
          }
        });

        socket.disconnect(true);
      }
    });

    socket.on(SOCKET_EVENTS.HEARTBEAT, async (_payload = {}, ackFn) => {
      try {
        if (!socket.data.machineId) {
          console.warn(`[server] heartbeat rejected — not authenticated (socket: ${socket.id})`);
          throw new AppError(400, "MACHINE_NOT_REGISTERED", "machine:connect must run first");
        }

        await machineService.handleHeartbeat(socket, socket.data.machineId);
        await orderService.tryDispatchNextPending(socket.data.machineId);
        ack(ackFn, { ok: true, ts: Date.now() });
      } catch (error) {
        ack(ackFn, {
          ok: false,
          error: {
            code: error.code ?? "HEARTBEAT_FAILED",
            message: error.message
          }
        });
      }
    });

    socket.on(SOCKET_EVENTS.DONE, async (payload = {}, ackFn) => {
      try {
        const machineId = socket.data.machineId;
        const { orderId, result } = payload;

        if (!machineId) {
          throw new AppError(400, "MACHINE_NOT_REGISTERED", "machine:connect must run first");
        }

        if (!orderId || typeof orderId !== "string") {
          throw new AppError(400, "INVALID_ORDER_ID", "orderId is required");
        }

        if (result === "SUCCESS") {
          await orderService.markCompleted(orderId);
        } else {
          await orderService.markFailed(orderId, "DISPENSE_FAILED");
        }

        await machineService.setMachineIdle(machineId);
        await orderService.tryDispatchNextPending(machineId);
        ack(ackFn, { ok: true, orderId });
      } catch (error) {
        ack(ackFn, {
          ok: false,
          error: {
            code: error.code ?? "MACHINE_DONE_FAILED",
            message: error.message
          }
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[server] socket disconnected: ${socket.id} (machine: ${socket.data.machineId ?? "unauthenticated"}, reason: ${reason})`);
      void machineService.handleDisconnect(socket);
    });
  });
}
