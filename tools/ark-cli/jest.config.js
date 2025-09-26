export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          jsx: 'react-jsx',
          target: 'ES2020',
          lib: ['ES2020'],
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          types: ['node', 'jest']
        }
      },
    ],
  },
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/index.tsx',
    '!src/commands/chat.tsx',
    '!src/commands/chat/index.tsx',
    '!src/commands/**/selector.tsx',
    '!src/components/*.tsx',
    '!src/ui/*.tsx'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  // Coverage thresholds - these ensure coverage doesn't decrease
  // Current values as of the latest test run
  coverageThreshold: {
    global: {
      branches: 17,
      functions: 24,
      lines: 23,
      statements: 23
    }
  },
};