import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tenants = ["cc-phuket-residence", "andaman-bay-demo"];
await mkdir(path.join(root, "artifacts", "apps"), { recursive: true });

for (const tenant of tenants) {
  const output = path.join(root, "artifacts", "apps", tenant);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@staybuddy/mobile",
        "exec",
        "expo",
        "export",
        "--platform",
        "all",
        "--output-dir",
        output,
        "--clear",
      ],
      { cwd: root, env: { ...process.env, STAYBUDDY_TENANT: tenant }, stdio: "inherit" },
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`APP_EXPORT_FAILED:${tenant}:${code}`)),
    );
    child.on("error", reject);
  });
}
