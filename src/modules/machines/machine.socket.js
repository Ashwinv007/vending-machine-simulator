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
    socket.on(SOCKET_EVENTS.CONNECT, async (payload = {}, ackFn) => {
      try {
        const { machineId, token } = payload;

        if (!isValidMachineId(machineId)) {
          throw new AppError(400, "INVALID_MACHINE_ID", "machineId is invalid");
        }

        if (!machineService.authenticateMachine(machineId, token)) {
          throw new AppError(401, "UNAUTHORIZED_MACHINE", "machine token is invalid");
        }

        await machineService.handleConnect(socket, machineId);
        await orderService.tryDispatchNextPending(machineId);
        ack(ackFn, { ok: true, machineId });
      } catch (error) {
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

    socket.on("disconnect", () => {
      void machineService.handleDisconnect(socket);
    });
  });
}
