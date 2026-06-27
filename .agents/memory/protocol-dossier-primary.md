---
name: Protocol↔dossier primary invariant
description: How multi-fascicolo protocol filing keeps a single primary consistent with protocols.dossierId
---

A protocol can be filed in many dossiers via the `protocol_dossiers` junction
(isPrimary flag). `protocols.dossierId` mirrors the primary membership.

Rule: a protocol with any memberships has **exactly one** primary; with none it
has zero. The first dossier a protocol is filed into is always primary,
regardless of the request's `isPrimary` flag.

**Why:** an earlier version set `protocols.dossierId` to a freshly-added
non-primary dossier when the protocol had no dossier yet, producing a
zero-primary junction that disagreed with `protocols.dossierId`. Architect
flagged it as a correctness break of the "one primary + others" requirement.

**How to apply:** every membership mutation (POST/PATCH/DELETE on
`/protocols/:id/dossiers*` and PATCH `/protocols/:id` with `dossierId`) runs
inside `db.transaction` and ends by recomputing the primary, then syncing
`protocols.dossierId` (or null). PATCH with `dossierId: null` must also demote
all junction primaries, not just clear the column.

**Backward compatibility:** dossier *reads* must not assume the junction is
populated. A protocol may exist with only `protocols.dossierId` set (legacy
rows, fresh seeds before backfill). All read paths go through a single
`getEffectiveMemberships()` helper that unions the junction with a synthetic
primary derived from `protocols.dossierId` for protocols that have NO junction
rows — never double-counting protocols that have both. Don't reintroduce
junction-only reads for counts/filters/lists.
