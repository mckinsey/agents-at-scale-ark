import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './artifacts/coverage',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/index.tsx',
        'src/commands/chat.tsx',
        'src/commands/chat/index.tsx',
        'src/commands/**/selector.tsx',
        'src/components/*.tsx',
        'src/ui/*.tsx',
      ],
      thresholds: {
        branches: 17,
        functions: 24,
        lines: 23,
        statements: 23,
      },
    },
  },
  resolve: {
    alias: {
      '^(\\.{1,2}/.*)\\.js$': '$1',
    },
  },
});
