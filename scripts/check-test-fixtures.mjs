import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repositoryRoot, "test/fixtures");
const fixturePaths = [];
const failures = [];

async function findJson(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await findJson(entryPath);
    if (entry.isFile() && entry.name.endsWith(".json")) fixturePaths.push(entryPath);
  }
}

function visitStrings(value, callback) {
  if (typeof value === "string") callback(value);
  if (Array.isArray(value)) value.forEach((item) => visitStrings(item, callback));
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => visitStrings(item, callback));
  }
}

await findJson(fixtureRoot);
if (fixturePaths.length === 0) failures.push("no JSON test fixtures found");

for (const fixturePath of fixturePaths) {
  const relativePath = path.relative(repositoryRoot, fixturePath);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (fixture.classification !== "SYNTHETIC") {
    failures.push(`${relativePath}: classification must be SYNTHETIC`);
  }
  if (!Number.isInteger(fixture.fixtureVersion) || fixture.fixtureVersion < 1) {
    failures.push(`${relativePath}: fixtureVersion must be a positive integer`);
  }
  visitStrings(fixture, (value) => {
    if (/\S+@\S+/.test(value) && !value.endsWith(".invalid")) {
      failures.push(`${relativePath}: email-like fixture values must use a reserved .invalid domain`);
    }
  });
}

if (failures.length) {
  process.stderr.write(`Test fixture policy failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Test fixture policy passed for ${fixturePaths.length} synthetic fixture(s).\n`);
}
