import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoots = ["apps", "services", "packages"];
const expectedPackages = new Set([
  "@staybuddy/api",
  "@staybuddy/concierge",
  "@staybuddy/contracts",
  "@staybuddy/db",
  "@staybuddy/domain",
  "@staybuddy/hotel-admin",
  "@staybuddy/localization",
  "@staybuddy/merchant-portal",
  "@staybuddy/mobile",
  "@staybuddy/observability",
  "@staybuddy/ops-admin",
  "@staybuddy/pms-sdk",
  "@staybuddy/ui",
  "@staybuddy/worker",
]);
const requiredScripts = ["build", "typecheck", "test"];
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const failures = [];
const manifests = [];

for (const workspaceRoot of workspaceRoots) {
  const parent = path.join(repositoryRoot, workspaceRoot);
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(parent, entry.name, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifests.push({ manifest, manifestPath });
  }
}

const names = new Set();
const externalVersions = new Map();
for (const { manifest, manifestPath } of manifests) {
  const relativePath = path.relative(repositoryRoot, manifestPath);
  if (names.has(manifest.name)) failures.push(`${relativePath}: duplicate package name ${manifest.name}`);
  names.add(manifest.name);
  if (!expectedPackages.has(manifest.name))
    failures.push(`${relativePath}: unexpected package ${manifest.name}`);
  if (manifest.private !== true) failures.push(`${relativePath}: workspace packages must be private`);

  for (const script of requiredScripts) {
    if (!manifest.scripts?.[script]) failures.push(`${relativePath}: missing ${script} script`);
  }

  for (const section of dependencySections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (name.startsWith("@staybuddy/")) {
        if (version !== "workspace:*") {
          failures.push(`${relativePath}: internal dependency ${name} must use workspace:*`);
        }
        continue;
      }
      const existing = externalVersions.get(name);
      if (existing && existing.version !== version) {
        failures.push(
          `${relativePath}: ${name}@${version} differs from ${existing.version} in ${existing.relativePath}`,
        );
      } else if (!existing) {
        externalVersions.set(name, { version, relativePath });
      }
    }
  }
}

for (const expected of expectedPackages) {
  if (!names.has(expected)) failures.push(`missing required workspace package ${expected}`);
}

const rootManifest = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
if (rootManifest.packageManager !== "pnpm@11.19.0") {
  failures.push("package.json: packageManager must pin pnpm@11.19.0");
}
if (rootManifest.engines?.node !== ">=22.0.0") {
  failures.push("package.json: Node.js engine baseline must remain >=22.0.0");
}

const workspacePolicy = await readFile(path.join(repositoryRoot, "pnpm-workspace.yaml"), "utf8");
for (const pattern of ["apps/*", "services/*", "packages/*"]) {
  if (!workspacePolicy.includes(`- ${pattern}`)) failures.push(`pnpm-workspace.yaml: missing ${pattern}`);
}
if (!/^minimumReleaseAge:\s+1440$/m.test(workspacePolicy)) {
  failures.push("pnpm-workspace.yaml: minimumReleaseAge must remain 1440 minutes");
}
if (!workspacePolicy.includes("onlyBuiltDependencies:")) {
  failures.push("pnpm-workspace.yaml: native dependency build allowlist is required");
}

if (failures.length) {
  process.stderr.write(`Dependency policy failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Dependency policy passed for ${manifests.length} workspaces and ${externalVersions.size} external packages.\n`,
  );
}
