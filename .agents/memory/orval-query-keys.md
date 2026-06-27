---
name: Orval query-key invalidation
description: How Orval-generated React Query keys are shaped and how to invalidate them in this DMS
---

# Orval query keys are URL-based, not operation-named

Orval generates query keys from the request URL, e.g.:
- `getListDossierWorkflowRulesQueryKey(id)` → `[`/api/dossiers/${id}/workflow-rules`]`
- `getListWorkflowInstancesQueryKey(params)` → `[`/api/workflow-instances`, params?]`

**Rule:** `qc.invalidateQueries({ queryKey: ["listXxx"] })` (operation-name style) silently
matches nothing — the cache keys start with the `/api/...` URL string.

**How to apply:** invalidate with the URL prefix (`["/api/workflow-instances"]`, partial match
ignores the trailing params element) or, when you don't know the dossier id from the current
page, use a predicate:
```ts
qc.invalidateQueries({
  predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].includes("workflow-instances"),
});
```
