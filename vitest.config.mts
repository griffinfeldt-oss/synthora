import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside a React Server environment; tests are server code.
      "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // DB-backed suites share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
