import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['packages/**/src/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.wxt/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**'],
    },
  },
});
