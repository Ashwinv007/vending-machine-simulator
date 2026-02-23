import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import QRCode from "qrcode";

dotenv.config();

const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
const argIds = process.argv.slice(2).flatMap((value) => value.split(",")).map((v) => v.trim()).filter(Boolean);
const machineIds = argIds.length > 0 ? argIds : [process.env.MACHINE_ID ?? "M01"];

const outputDir = path.join(process.cwd(), "qr");

await fs.mkdir(outputDir, { recursive: true });

for (const machineId of machineIds) {
  const buyUrl = `${baseUrl}/buy?machineId=${encodeURIComponent(machineId)}`;
  const filePath = path.join(outputDir, `${machineId}.png`);

  await QRCode.toFile(filePath, buyUrl, {
    margin: 1,
    width: 512,
    color: {
      dark: "#0b172a",
      light: "#ffffff"
    }
  });

  console.log(`Generated ${filePath} -> ${buyUrl}`);
}
