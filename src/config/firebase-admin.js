import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase as getAdminDatabase } from "firebase-admin/database";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

function parseServiceAccountJson(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: String(parsed.private_key ?? parsed.privateKey ?? "").replace(/\\n/g, "\n")
    };
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
}

function parseServiceAccountFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  let rawJson = "";
  try {
    rawJson = fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read FIREBASE_SERVICE_ACCOUNT_PATH (${absolutePath}): ${error.message}`);
  }

  return parseServiceAccountJson(rawJson);
}

function resolveServiceAccount() {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY
    };
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return parseServiceAccountFile(env.FIREBASE_SERVICE_ACCOUNT_PATH);
  }

  throw new Error(
    "Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (recommended), or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or FIREBASE_SERVICE_ACCOUNT_PATH."
  );
}

function validateServiceAccount(serviceAccount) {
  const missing = [];

  if (!serviceAccount.projectId) {
    missing.push("projectId");
  }

  if (!serviceAccount.clientEmail) {
    missing.push("clientEmail");
  }

  if (!serviceAccount.privateKey) {
    missing.push("privateKey");
  }

  if (missing.length > 0) {
    throw new Error(`Invalid Firebase Admin credentials. Missing fields: ${missing.join(", ")}`);
  }
}

function initAdminDatabase() {
  const serviceAccount = resolveServiceAccount();
  validateServiceAccount(serviceAccount);

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert(serviceAccount),
          databaseURL: env.FIREBASE_DATABASE_URL
        });

  return getAdminDatabase(app);
}

const adminDb = initAdminDatabase();

export const databaseMode = "admin";

export async function rtdbGet(path) {
  const snapshot = await adminDb.ref(path).get();
  return snapshot.exists() ? snapshot.val() : null;
}

export async function rtdbSet(path, value) {
  await adminDb.ref(path).set(value);
}

export async function rtdbUpdate(path, value) {
  await adminDb.ref(path).update(value);
}

export async function rtdbCreateIfAbsent(path, value) {
  const ref = adminDb.ref(path);
  const result = await ref.transaction((current) => {
    if (current !== null && current !== undefined) {
      return;
    }

    return value;
  });

  return {
    created: result.committed,
    snapshotValue: result.snapshot.exists() ? result.snapshot.val() : null
  };
}
