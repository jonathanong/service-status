import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: process.env.CI ? { junit: "./test-results/junit.xml" } : {},
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["plugins/service-status/hooks/lib/**/*.js", "scripts/lib/**/*.js"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
