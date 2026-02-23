import { MACHINE_STATUS, SOCKET_EVENTS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import { nowMs } from "../../utils/time.js";
import * as machineRepo from "./machine.repo.js";
import { machineRegistry } from "./machine.registry.js";

class MachineService {
  constructor() {
    this.io = null;
    this.heartbeatMonitor = null;
  }

  attachIo(io) {
    this.io = io;
    this.startHeartbeatMonitor();
  }

  startHeartbeatMonitor() {
    if (this.heartbeatMonitor) {
      return;
    }

    this.heartbeatMonitor = setInterval(() => {
      void this.markStaleMachinesOffline();
    }, env.MACHINE_HEARTBEAT_CHECK_MS);

    if (typeof this.heartbeatMonitor.unref === "function") {
      this.heartbeatMonitor.unref();
    }
  }

  authenticateMachine(machineId, token) {
    const machineToken = env.MACHINE_TOKENS[machineId];
    const expected = machineToken ?? env.MACHINE_SHARED_TOKEN;
    return token === expected;
  }

  async handleConnect(socket, machineId) {
    machineRegistry.upsert(machineId, socket.id);
    socket.data.machineId = machineId;
    await machineRepo.markMachineConnected(machineId);
  }

  async handleHeartbeat(socket, machineId) {
    const resolvedMachineId = machineId ?? socket.data.machineId;

    if (!resolvedMachineId) {
      throw new AppError(400, "MACHINE_ID_REQUIRED", "machineId is required for heartbeat");
    }

    machineRegistry.touch(resolvedMachineId);
    await machineRepo.touchMachine(resolvedMachineId);
  }

  async handleDisconnect(socket) {
    const machineId = machineRegistry.removeBySocketId(socket.id);
    if (!machineId) {
      return;
    }

    await machineRepo.markMachineDisconnected(machineId);
  }

  async markStaleMachinesOffline() {
    const cutoff = nowMs() - env.MACHINE_HEARTBEAT_TIMEOUT_MS;

    for (const machine of machineRegistry.entries()) {
      if (machine.lastSeenAt >= cutoff) {
        continue;
      }

      machineRegistry.removeByMachineId(machine.machineId);
      await machineRepo.markMachineDisconnected(machine.machineId);
    }
  }

  async isMachineOnline(machineId) {
    const machine = machineRegistry.get(machineId);
    if (!machine) {
      return false;
    }

    if (nowMs() - machine.lastSeenAt > env.MACHINE_HEARTBEAT_TIMEOUT_MS) {
      machineRegistry.removeByMachineId(machineId);
      await machineRepo.markMachineDisconnected(machineId);
      return false;
    }

    return true;
  }

  async dispatchDispense(machineId, payload) {
    if (!this.io) {
      throw new AppError(500, "SOCKET_NOT_READY", "Socket layer is not initialized");
    }

    const machine = machineRegistry.get(machineId);
    if (!machine) {
      return false;
    }

    const online = await this.isMachineOnline(machineId);
    if (!online) {
      return false;
    }

    this.io.to(machine.socketId).emit(SOCKET_EVENTS.DISPENSE, payload);
    await machineRepo.setMachineStatus(machineId, MACHINE_STATUS.DISPENSING, true);
    return true;
  }

  async setMachineIdle(machineId) {
    await machineRepo.setMachineStatus(machineId, MACHINE_STATUS.IDLE, true);
  }

  async getMachineStatus(machineId) {
    return machineRepo.getMachine(machineId);
  }
}

export const machineService = new MachineService();
