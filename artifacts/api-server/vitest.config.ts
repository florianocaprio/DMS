import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Silence pino request logging so test output stays readable.
    env: { LOG_LEVEL: "silent" },
    // Workspace packages export raw TypeScript (e.g. "@workspace/db" -> src/index.ts),
    // so they must be transformed by Vite instead of being externalized as node deps.
    server: { deps: { inline: [/@workspace\//] } },
    // Integration tests hit a real Postgres database; give them room and run
    // test files sequentially so concurrent writes never race each other.
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
