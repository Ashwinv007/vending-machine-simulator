import fs from "node:fs/promises";
import path from "node:path";
import { buildOpenApiSpec } from "../src/docs/openapi.js";

const outputArg = process.argv[2] ?? "docs/openapi.json";
const outputPath = path.isAbsolute(outputArg)
  ? outputArg
  : path.resolve(process.cwd(), outputArg);

const spec = buildOpenApiSpec();
await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), "utf8");

console.log(`OpenAPI exported to ${outputPath}`);
