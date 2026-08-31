# Main Branch Protection Runbook

## Required GitHub checks

Configure the repository's `main` branch or ruleset to require the following exact GitHub Actions job names:

- `Required / Quality`
- `Required / Migrations & Integration`
- `Required / Build Artifacts`
- `Required / Secret Scan`

Also require a pull request, one approving review, resolution of review conversations, dismissal of stale approvals after new commits, the branch to be up to date, linear history, and blocked force-push/deletion. Administrators should not bypass these controls for normal delivery.

## Single-maintainer bootstrap

For repository bootstrap only, PR #1 used zero required approvals because the sole repository owner cannot approve their own pull request. All status, freshness, conversation, history, administrator, force-push, and deletion controls remained enforced. Immediately after the bootstrap merge, the final rule must be raised to one required approval. This exception does not apply to subsequent pull requests.

## Verification

1. Open a pull request containing a harmless fixture-only change.
2. Confirm all four checks start and finish successfully.
3. Confirm the build job publishes `staybuddy-build-<commit SHA>` with mobile, portal, service, package, and OpenAPI outputs.
4. Confirm merge remains blocked when any required check fails or is absent.
5. Record the workflow URL and commit SHA in the active sprint acceptance report.

## Local parity

`pnpm ci:verify` runs the same quality, migration, integration, build, app-factory, and source secret gates. It requires `DATABASE_URL` to target a disposable PostgreSQL database. Local parity is diagnostic evidence; it does not replace the hosted-branch-protection verification above.

## Failure handling

- Never weaken a required check to merge a failing change.
- Treat contract drift by regenerating and reviewing `docs/contracts/openapi.json`.
- Treat migration failures as forward fixes; never edit a migration that has been applied.
- Rotate any exposed credential before removing it from Git history and re-running the secret scan.
