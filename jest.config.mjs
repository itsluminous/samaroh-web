import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Load next.config.ts and .env files in the test environment.
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/shared/',
    '<rootDir>/e2e/', // Playwright specs — run via `npx playwright test`
  ],
};

// next/jest ignores node_modules for transformation (allowlisting only a few
// packages), but next-intl and use-intl ship ESM-only and must be transpiled
// for the CJS jest runtime — extend the allowlist group in its patterns.
export default async function buildJestConfig() {
  const jestConfig = await createJestConfig(config)();
  return {
    ...jestConfig,
    transformIgnorePatterns: (jestConfig.transformIgnorePatterns ?? []).map((pattern) =>
      pattern.replace('(geist', '(geist|next-intl|use-intl|@formatjs|intl-messageformat'),
    ),
  };
}
