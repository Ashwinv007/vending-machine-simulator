import dotenv from "dotenv";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value: ${value}`);
  }

  return parsed;
}

function parseJsonObject(value, name) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON value must be an object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

function normalizePrivateKey(value) {
  if (!value) {
    return value;
  }

  return value.replace(/\\n/g, "\n");
}

const port = parseNumber(process.env.PORT, 3000);
const upiScannerMode = parseBoolean(process.env.UPI_SCANNER_MODE, true);
const orderAmountInr = parseNumber(process.env.ORDER_AMOUNT_INR, 20);

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: port,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
  UPI_SCANNER_MODE: upiScannerMode,

  ORDER_AMOUNT_INR: orderAmountInr,
  ORDER_AMOUNT_PAISE: Math.round(orderAmountInr * 100),
  ORDER_CURRENCY: process.env.ORDER_CURRENCY ?? "INR",

  RAZORPAY_KEY_ID: requireEnv("RAZORPAY_KEY_ID"),
  RAZORPAY_KEY_SECRET: requireEnv("RAZORPAY_KEY_SECRET"),
  RAZORPAY_WEBHOOK_SECRET: upiScannerMode
    ? requireEnv("RAZORPAY_WEBHOOK_SECRET")
    : process.env.RAZORPAY_WEBHOOK_SECRET,

  FIREBASE_DATABASE_URL: requireEnv("FIREBASE_DATABASE_URL"),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,

  MACHINE_SHARED_TOKEN: process.env.MACHINE_SHARED_TOKEN ?? "dev-machine-token",
  MACHINE_TOKENS: parseJsonObject(process.env.MACHINE_TOKENS_JSON, "MACHINE_TOKENS_JSON"),
  MACHINE_HEARTBEAT_TIMEOUT_MS: parseNumber(process.env.MACHINE_HEARTBEAT_TIMEOUT_MS, 30000),
  MACHINE_HEARTBEAT_CHECK_MS: parseNumber(process.env.MACHINE_HEARTBEAT_CHECK_MS, 5000)
};
