---
name: Orval queryKey requirement
description: Passing empty {} as query options to Orval-generated hooks causes a TypeScript error — queryKey must be provided explicitly.
---

Orval-generated React Query hooks have a required `queryKey` in the query options type. Calling with `{ query: {} }` fails type-check.

**Why:** The generated hook signature requires `queryOptions.queryKey` to be defined. This is strict Orval behavior with the TanStack Query v5 adapter.

**How to apply:** Always pass the matching query key helper:
```ts
// Wrong
useListDocuments(params, { query: {} })

// Correct
import { getListDocumentsQueryKey } from "@workspace/api-client-react";
useListDocuments(params, { query: { queryKey: getListDocumentsQueryKey(params) } })
```
For hooks with no params (e.g. `useListClassifications`): `getListClassificationsQueryKey()` (no args).
