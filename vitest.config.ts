import { defineConfig, defineProject } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**'],
    },
    // Vitest 4 removed `test.workspace` and per-file env matching; use projects
    // to run DOM-ish packages and Node-only packages under the right runtime.
    projects: [
      defineProject({
        test: {
          name: 'dom',
          globals: true,
          environment: 'happy-dom',
          include: [
            'packages/core/src/**/*.test.ts',
            'packages/core/tests/**/*.test.ts',
            'packages/extension/src/**/*.test.ts',
            'packages/extension/tests/**/*.test.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.wxt/**'],
          // Ensure extension tests get the WebExtension `browser` mock installed.
          setupFiles: ['packages/extension/src/__test__/setup.ts'],
        },
      }),
      defineProject({
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: [
            'packages/native-host/src/**/*.test.ts',
            'packages/native-host/tests/**/*.test.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.wxt/**'],
        },
      }),
    ],
  },
});
