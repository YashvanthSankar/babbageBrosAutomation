import { defineConfig } from "vitest/config";
import path from "node:path";

const resolve = { alias: { "@": path.resolve(__dirname, ".") } };

export default defineConfig({
  resolve,
  test: {
    projects: [
      { resolve, test: { name: "app", environment: "node", include: ["tests/**/*.test.ts"], exclude: ["tests/convex-flow.test.ts"] } },
      { resolve, test: { name: "convex", environment: "edge-runtime", include: ["tests/convex-flow.test.ts"] } },
    ],
  },
});
