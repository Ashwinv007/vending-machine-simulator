class MachineRegistry {
  constructor() {
    this.byMachineId = new Map();
    this.bySocketId = new Map();
  }

  upsert(machineId, socketId) {
    const entry = {
      machineId,
      socketId,
      lastSeenAt: Date.now()
    };

    const existing = this.byMachineId.get(machineId);
    if (existing) {
      this.bySocketId.delete(existing.socketId);
    }

    this.byMachineId.set(machineId, entry);
    this.bySocketId.set(socketId, machineId);
    return entry;
  }

  touch(machineId) {
    const entry = this.byMachineId.get(machineId);
    if (!entry) {
      return null;
    }

    entry.lastSeenAt = Date.now();
    this.byMachineId.set(machineId, entry);
    return entry;
  }

  get(machineId) {
    return this.byMachineId.get(machineId) ?? null;
  }

  removeBySocketId(socketId) {
    const machineId = this.bySocketId.get(socketId);
    if (!machineId) {
      return null;
    }

    this.bySocketId.delete(socketId);
    this.byMachineId.delete(machineId);
    return machineId;
  }

  removeByMachineId(machineId) {
    const entry = this.byMachineId.get(machineId);
    if (!entry) {
      return null;
    }

    this.byMachineId.delete(machineId);
    this.bySocketId.delete(entry.socketId);
    return entry;
  }

  entries() {
    return Array.from(this.byMachineId.values());
  }
}

export const machineRegistry = new MachineRegistry();
