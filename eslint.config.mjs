import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'messages/**',
      'shared/**', // git submodule — linted by its own repo
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // HARD i18n RULE (§5): no user-visible string literals in JSX — every
    // string comes from the shared catalog via next-intl. Props are exempt
    // (`ignoreProps`) so technical literals (variant="contained", type="email",
    // autoComplete="email", …) stay usable; accessible names (aria-label,
    // Tooltip title) must still be passed t() values by convention and are
    // covered in review + tests.
    files: ['src/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          allowedStrings: [],
          ignoreProps: true,
          noAttributeStrings: false,
        },
      ],
    },
  },
];

export default eslintConfig;
