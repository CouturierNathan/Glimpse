import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/build/',
    '**/coverage/',
    '**/.next/',
    'contracts/artifacts/',
    'contracts/cache/',
    'contracts/types/',
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
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
