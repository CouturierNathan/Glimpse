import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/build/',
    '**/coverage/',
    '**/.next/',
    '**/next-env.d.ts',
    'contracts/artifacts/',
    'contracts/cache/',
    'contracts/types/',
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['apps/web/**'],
    ...nextPlugin.configs['core-web-vitals'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
])
