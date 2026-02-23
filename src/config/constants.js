export const ORDER_STATUS = Object.freeze({
  CREATED: "CREATED",
  PAID: "PAID",
  DISPENSING: "DISPENSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
});

export const MACHINE_STATUS = Object.freeze({
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  DISPENSING: "DISPENSING",
  IDLE: "IDLE"
});

export const SOCKET_EVENTS = Object.freeze({
  CONNECT: "machine:connect",
  HEARTBEAT: "machine:heartbeat",
  DISPENSE: "machine:dispense",
  DONE: "machine:done"
});
