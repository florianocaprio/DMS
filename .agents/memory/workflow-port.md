---
name: Workflow PORT requirement
description: Both api-server and dms Vite app require PORT env var injected in the workflow run command.
---

Both the Express API server and the Vite DMS frontend crash at startup if `PORT` is not set in the environment.

**Why:** The api-server `src/index.ts` throws explicitly if `process.env.PORT` is missing. The Vite `vite.config.ts` also reads PORT and throws similarly.

**How to apply:** Always include `PORT=<value>` in the workflow run command string:
- API Server: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- DMS App: `PORT=19176 BASE_PATH=/ pnpm --filter @workspace/dms run dev`
