import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Storage and MCP cases spawn child processes; keep CI and local runs within a predictable resource budget.
    maxWorkers: 2,
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
