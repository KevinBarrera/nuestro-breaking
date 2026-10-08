import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const publicApiPatterns = [
  '@/app/*',
  '@/pages/*/*',
  '@/widgets/*/*',
  '@/features/*/*',
  '@/entities/*/*',
  '@/shared/*/*',
];

function importRestrictions(forbiddenLayers = []) {
  const layerPatterns = forbiddenLayers.flatMap((layer) => [layer, `${layer}/**`]);

  return [
    'error',
    {
      patterns: [
        {
          regex: '^\\.\\.(?:/|$)',
          message:
            'Parent-directory imports are not allowed. Use the application alias or a same-directory import.',
        },
        {
          group: publicApiPatterns,
          message: 'Use a slice public API or a same-directory import within the same slice.',
        },
        ...(layerPatterns.length > 0
          ? [
              {
                group: layerPatterns,
                message: 'This import violates the Feature-Sliced Design layer direction.',
              },
            ]
          : []),
      ],
    },
  ];
}

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': importRestrictions(),
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions([
        '@/app',
        '@/pages',
        '@/widgets',
        '@/features',
        '@/entities',
      ]),
    },
  },
  {
    files: ['src/entities/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(['@/app', '@/pages', '@/widgets', '@/features']),
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(['@/app', '@/pages', '@/widgets']),
    },
  },
  {
    files: ['src/widgets/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(['@/app', '@/pages']),
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': importRestrictions(['@/app']),
    },
  },
  eslintConfigPrettier,
]);
