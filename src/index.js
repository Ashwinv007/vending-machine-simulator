import http from "node:http";
import { Server } from "socket.io";
import { app } from "./app.js";
import { databaseMode } from "./config/firebase-admin.js";
import { env } from "./config/env.js";
import { registerMachineSocket } from "./modules/machines/machine.socket.js";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

registerMachineSocket(io);

server.listen(env.PORT, () => {
  console.log(`API server listening on port ${env.PORT}`);
  console.log(`Database mode: ${databaseMode}`);
});
