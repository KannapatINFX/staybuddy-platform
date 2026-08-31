import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([
  ".git",
  ".next",
  ".terraform",
  ".turbo",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "web-build",
]);
const blockedFileName = /(^\.env(?!\.example$)|\.(key|p12|pfx|pem)$)/i;
const secretPatterns = [
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ["private key", /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
];
const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lockb",
  ".pdf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);
const failures = [];
let scannedFiles = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(path.join(directory, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(repositoryRoot, absolutePath);
    if (blockedFileName.test(entry.name)) {
      failures.push(`${relativePath}: secret-bearing file type is not allowed`);
      continue;
    }
    if (binaryExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const contents = await readFile(absolutePath, "utf8").catch(() => undefined);
    if (contents === undefined || contents.length > 2_000_000) continue;
    scannedFiles += 1;
    for (const [label, pattern] of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(contents)) failures.push(`${relativePath}: possible ${label}`);
    }
  }
}

await walk(repositoryRoot);

if (failures.length) {
  process.stderr.write(`Secret scan failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan passed for ${scannedFiles} source files.\n`);
}
