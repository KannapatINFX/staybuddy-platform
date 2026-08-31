import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenApiDocument } from "./openapi.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(currentDirectory, "../../../docs/contracts");
const outputPath = path.join(outputDirectory, "openapi.json");
const generated = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const committed = await readFile(outputPath, "utf8").catch(() => "");
  if (committed !== generated) {
    process.stderr.write(
      "OpenAPI contract drift detected. Run `pnpm contracts:generate` and commit the result.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("OpenAPI contract is current.\n");
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, generated);
  process.stdout.write(`Generated ${path.relative(process.cwd(), outputPath)}.\n`);
}
