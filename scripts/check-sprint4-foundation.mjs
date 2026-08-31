import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let controls = 0;

async function expect(relativePath, pattern, description) {
  const contents = await readFile(path.join(root, relativePath), "utf8");
  controls += 1;
  if (!pattern.test(contents)) failures.push(`${relativePath}: ${description}`);
}

const checks = [
  ["infra/terraform/versions.tf", /backend\s+"s3"/, "remote S3 state backend is required"],
  ["infra/terraform/main.tf", /resource\s+"aws_vpc"/, "VPC baseline is required"],
  ["infra/terraform/main.tf", /requires_compatibilities\s*=\s*\["FARGATE"\]/, "ECS must use Fargate"],
  ["infra/terraform/main.tf", /manage_master_user_password\s*=\s*true/, "RDS must manage its master secret"],
  [
    "infra/terraform/main.tf",
    /multi_az\s*=\s*var\.environment == "production"/,
    "production RDS must be Multi-AZ",
  ],
  [
    "infra/terraform/main.tf",
    /transit_encryption_enabled\s*=\s*true/,
    "Redis transport encryption is required",
  ],
  [
    "infra/terraform/main.tf",
    /resource\s+"aws_cloudfront_distribution"/,
    "private S3 assets require CloudFront",
  ],
  ["infra/terraform/main.tf", /resource\s+"aws_wafv2_web_acl"/, "public API requires WAF"],
  ["infra/terraform/main.tf", /enable_key_rotation\s*=\s*true/, "KMS rotation is required"],
  [
    "infra/terraform/main.tf",
    /aws_db_instance\.postgres\.master_user_secret/,
    "ECS must consume the RDS-managed secret",
  ],
  ["infra/terraform/main.tf", /aws-otel-collector/, "API and worker tasks require an ADOT sidecar"],
  ["infra/terraform/main.tf", /condition\s*=\s*"SUCCESS"/, "application containers must wait for migrations"],
  [
    "infra/terraform/main.tf",
    /deployment_circuit_breaker[\s\S]*rollback\s*=\s*true/,
    "ECS rollback must be enabled",
  ],
  [
    "infra/terraform/main.tf",
    /TargetResponseTime[\s\S]*extended_statistic\s*=\s*"p95"/,
    "p95 latency alarm is required",
  ],
  ["packages/observability/src/index.ts", /AWSXRayIdGenerator/, "X-Ray-compatible trace IDs are required"],
  ["packages/observability/src/index.ts", /OTLPTraceExporter/, "OTLP trace export is required"],
  ["packages/observability/src/index.ts", /Sentry\.init/, "Sentry error reporting is required"],
  [
    "packages/observability/src/index.ts",
    /Deployed environments require/,
    "deployed telemetry must fail closed",
  ],
  ["services/api/src/main.ts", /x-trace-id/, "API responses must expose a safe trace ID"],
  ["services/worker/src/processor.ts", /withExtractedTrace/, "worker jobs must extract trace context"],
  [
    "pnpm-workspace.yaml",
    /injectWorkspacePackages:\s*true/,
    "container deploys must package workspace dependencies",
  ],
  [
    "services/api/Dockerfile",
    /deploy --prod \/release/,
    "API production layout must use isolated pnpm deploy",
  ],
  [
    "services/api/Dockerfile",
    /--import.*instrumentation\.js/,
    "API telemetry must preload before framework imports",
  ],
  [
    "services/worker/Dockerfile",
    /deploy --prod \/release/,
    "worker production layout must use isolated pnpm deploy",
  ],
  [
    "services/worker/Dockerfile",
    /--import.*instrumentation\.js/,
    "worker telemetry must preload before queue imports",
  ],
  [".github/workflows/deploy-dev.yml", /id-token:\s*write/, "AWS authentication must use GitHub OIDC"],
  [
    ".github/workflows/deploy-dev.yml",
    /environment:\s*dev/,
    "deployment must use the protected dev environment",
  ],
  [
    ".github/workflows/deploy-dev.yml",
    /terraform.*plan -input=false -out=dev\.tfplan/,
    "deployment must apply a saved plan",
  ],
  [
    ".github/workflows/deploy-dev.yml",
    /aws ecs wait services-stable/,
    "deployment must wait for ECS stability",
  ],
  [".github/workflows/deploy-dev.yml", /x-trace-id/, "deployment must verify a health trace ID"],
  [
    ".github/workflows/deploy-dev.yml",
    /aws xray batch-get-traces/,
    "deployment must prove the trace reached X-Ray",
  ],
  ["infra/terraform/backend.hcl.example", /use_lockfile\s*=\s*true/, "Terraform state locking is required"],
];

for (const check of checks) await expect(...check);

if (failures.length) {
  process.stderr.write(`Sprint 4 foundation check failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Sprint 4 foundation check passed for ${controls} controls.\n`);
}
