# Dependency Policy

This policy applies to every package in `staybuddy-platform`.

## Required controls

- Use pnpm `11.19.0` and commit `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`.
- Use Node.js 22 or newer; build images and CI currently pin Node.js `22.22.0`.
- Keep every internal `@staybuddy/*` dependency on `workspace:*`; unpublished local packages must never resolve from a registry.
- Keep shared external dependency ranges identical across workspaces. Upgrade a shared dependency as one reviewed change.
- Keep every workspace private and provide `build`, `typecheck`, and `test` scripts so Turbo can run the same gate everywhere.
- Retain pnpm's 24-hour minimum release age and explicit native build-script allowlist in `pnpm-workspace.yaml`.
- Do not introduce a client-side database SDK, tenant-selectable persistence path, or secret-bearing public/mobile dependency.

## Review gate

Run:

```bash
pnpm install --frozen-lockfile
pnpm dependencies:check
pnpm ci:quality
```

Dependency additions must explain their owner, runtime surface, license, security implications, bundle/deployment cost, and why a current workspace dependency is insufficient. Renovation or security updates must preserve the same gates; emergency updates may bypass the 24-hour age delay only through a reviewed pull request with evidence.
