# Test Fixture Contract

All committed fixtures must be synthetic, deterministic, tenant-labelled, and safe to publish. Use reserved domains such as `example.invalid`; never copy production guest, staff, hotel, credential, payment, or provider data.

Fixture rules:

- Give each fixture a `fixtureVersion` and `classification: "SYNTHETIC"`.
- Use stable IDs when deterministic replay matters and random IDs only inside the test that owns them.
- Represent at least Hotel A and Hotel B when a tenant-owned repository or module is tested.
- Keep expected output beside the input when a contract, adapter, or migration transforms data.
- Update fixtures and the owning tests in the same change; version incompatible shapes.
- Do not share writable fixture state between tests.

`platform/minimal-change.json` is the engineering-system smoke fixture. Feature sprints add bounded-context fixtures below their own named directories.
