# Reservation Ingestion Operations

## Supported paths

- CSV preview/commit with inline or saved mapping.
- Manual reservation entry when no file or connector is available.
- Future PMS/channel adapters normalize into the same canonical contract.

## Operator flow

1. Select or create a mapping and hotel timezone.
2. Generate preview and review valid/rejected rows.
3. Commit once with an idempotency key. The API decrypts and reparses the original source.
4. Inspect created, updated, unchanged, conflicted, and rejected counters.
5. Correct source/mapping problems and retry. Retry creates a linked batch; it never rewrites history.

## Outcomes

- `CREATED`: new source identity and Upcoming Stay.
- `UPDATED`: same identity with newer source timestamp.
- `UNCHANGED`: same timestamp and canonical payload; no mutation/event.
- `CONFLICTED`: older timestamp or equal timestamp with different content; row is isolated.
- `PARTIALLY_REJECTED`: invalid/conflicted rows exist; valid rows remain committed.

## Health

- `HEALTHY`: recent completed attempt.
- `PARTIAL`: rejected/conflicted rows need review.
- `FAILED`: processing failed; inspect safe detail and retry after correction.
- `STALE`: no attempt in 48 hours; verify expected volume/schedule.
- `FALLBACK_ONLY`: no batch exists; CSV/manual remains available.

Import failure must not disable guest runtime or manual entry. Ops health is read-only; Hotel staff own mapping and retry mutations.

## Security, retention, and recovery

- CSV may contain PII and is encrypted with `PII_ENCRYPTION_KEY_BASE64`. Never log raw CSV or decrypted payload.
- Preview IDs are tenant-bound, expire after 24 hours, and are single-commit. Retry may reference a prior encrypted source.
- Before production, schedule deletion of expired previews and define retry-source retention. Preserve counters, safe rejection detail, retry lineage, audit, and outbox after source deletion.
- Reuse an idempotency key only for the exact same request. Never edit applied migrations or historical batches; repair forward.
- A failed transaction commits no partial mutation. Re-preview or retry after resolving the cause.
