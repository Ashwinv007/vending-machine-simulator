import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import QRCode from "qrcode";
import { env } from "../src/config/env.js";
import { razorpayClient } from "../src/config/razorpay.js";
import {
  mapQrCodeToMachine,
  setMachinePaymentProfile
} from "../src/modules/machines/machine.repo.js";

dotenv.config();

const argIds = process.argv
  .slice(2)
  .flatMap((value) => value.split(","))
  .map((v) => v.trim())
  .filter(Boolean);

const machineIds = argIds.length > 0 ? argIds : ["M01"];
const outputDir = path.join(process.cwd(), "qr");

async function saveQrImage({ machineId, imageUrl, shortUrl }) {
  const outputPath = path.join(outputDir, `${machineId}.png`);

  if (imageUrl) {
    const response = await fetch(imageUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);
      return outputPath;
    }
  }

  if (!shortUrl) {
    throw new Error(`QR image URL not available for machine ${machineId}`);
  }

  await QRCode.toFile(outputPath, shortUrl, {
    margin: 1,
    width: 512,
    color: {
      dark: "#0b172a",
      light: "#ffffff"
    }
  });

  return outputPath;
}

async function provisionMachineQr(machineId) {
  const qr = await razorpayClient.qrCode.create({
    type: "upi_qr",
    usage: "multiple_use",
    fixed_amount: true,
    payment_amount: env.ORDER_AMOUNT_PAISE,
    name: `Vending-${machineId}`,
    description: `UPI QR for machine ${machineId}`,
    notes: {
      machineId
    }
  });

  await mapQrCodeToMachine(qr.id, machineId);
  await setMachinePaymentProfile(machineId, {
    provider: "razorpay_qr",
    qrCodeId: qr.id,
    qrImageUrl: qr.image_url ?? null,
    qrShortUrl: qr.short_url ?? null,
    fixedAmountPaise: env.ORDER_AMOUNT_PAISE,
    updatedAt: Date.now()
  });

  const filePath = await saveQrImage({
    machineId,
    imageUrl: qr.image_url ?? null,
    shortUrl: qr.short_url ?? null
  });

  return {
    machineId,
    qrCodeId: qr.id,
    shortUrl: qr.short_url ?? null,
    filePath
  };
}

await fs.mkdir(outputDir, { recursive: true });

for (const machineId of machineIds) {
  const result = await provisionMachineQr(machineId);
  console.log(
    `Provisioned ${result.machineId} -> qrCodeId=${result.qrCodeId}, file=${result.filePath}, shortUrl=${result.shortUrl ?? "n/a"}`
  );
}
