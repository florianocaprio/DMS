---
name: Duplicate artifact workflows
description: Hand-made workflows can collide on ports with artifact-managed ones
---

This project's services are registered as artifacts, so the platform
auto-creates workflows named `artifacts/<dir>: <name>` (e.g.
`artifacts/api-server: API Server`, `artifacts/dms: web`). These inject
`PORT`/`BASE_PATH` automatically — the command itself is just
`pnpm --filter ... run dev` with no explicit PORT.

**Why:** legacy hand-made workflows (`API Server`, `DMS App`) that hard-coded
`PORT=...` in the command duplicated the artifact-managed ones and fought over
the same ports, causing EADDRINUSE / "port already in use" failures where one
of each pair was always failed.

**How to apply:** keep only the artifact-managed `artifacts/*` workflows;
remove hand-made duplicates. Restart/verify via the `artifacts/<dir>: <name>`
names. Do not re-add PORT-in-command workflows for these services.
