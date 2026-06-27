---
name: Drizzle onConflict empty set
description: Drizzle crashes when onConflictDoUpdate is given an empty set object
---

`db.insert(...).onConflictDoUpdate({ target, set: {} })` throws
`Error: No values to set` (from drizzle's mapUpdateSet) at runtime — it
typechecks fine, so it only surfaces when the conflict path executes.

**Why:** a conditional like `set: makePrimary ? { isPrimary: true } : {}` looks
harmless but the empty-object branch is invalid SQL for Drizzle.

**How to apply:** when the desired on-conflict behavior is "do nothing", use
`onConflictDoNothing({ target })` instead of an empty `set`. Split the insert
into primary/non-primary branches rather than passing an empty update object.
