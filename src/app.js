import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { validateJson } from "./middleware/validate-json.js";
import { createRouter } from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.join(__dirname, "web");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));
  app.use(validateJson);

  app.use("/web", express.static(webDir));

  app.use(createRouter({ webDir }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
