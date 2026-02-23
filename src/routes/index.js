import express from "express";
import path from "node:path";
import { databaseMode } from "../config/firebase-admin.js";
import { machineSocketContract } from "../docs/machine-socket-contract.js";
import { buildOpenApiSpec } from "../docs/openapi.js";
import { getMachineStatus } from "../modules/machines/machine.controller.js";
import { createOrder, getOrderById } from "../modules/orders/order.controller.js";
import { isValidMachineId } from "../modules/orders/order.validators.js";
import { verifyPayment } from "../modules/payments/payment.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export function createRouter({ webDir }) {
  const router = express.Router();

  function healthPayload() {
    return {
      ok: true,
      databaseMode,
      ts: Date.now()
    };
  }

  router.get("/", (_req, res) => {
    res.status(200).json(healthPayload());
  });

  router.get("/health", (_req, res) => {
    res.status(200).json(healthPayload());
  });
  router.get("/healthz", (_req, res) => {
    res.status(200).json(healthPayload());
  });
  router.get("/ready", (_req, res) => {
    res.status(200).json(healthPayload());
  });
  router.get("/live", (_req, res) => {
    res.status(200).json(healthPayload());
  });

  router.get("/openapi.json", (_req, res) => {
    res.status(200).json(buildOpenApiSpec());
  });

  router.get("/docs", (_req, res) => {
    res.sendFile(path.join(webDir, "swagger.html"));
  });

  router.get(
    "/buy",
    asyncHandler(async (req, res) => {
      const { machineId } = req.query;
      if (!isValidMachineId(machineId)) {
        return res.status(400).json({
          error: {
            code: "INVALID_MACHINE_ID",
            message: "machineId query param is required, for example /buy?machineId=M01"
          }
        });
      }

      return res.sendFile(path.join(webDir, "buy.html"));
    })
  );

  router.post("/orders/create", asyncHandler(createOrder));
  router.get("/orders/:orderId", asyncHandler(getOrderById));
  router.post("/payments/verify", asyncHandler(verifyPayment));
  router.get("/machine/status", asyncHandler(getMachineStatus));
  router.get("/machine/socket-contract", (_req, res) => {
    res.status(200).json(machineSocketContract);
  });

  return router;
}
