import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      'output/',
      'example/',
      'test-output/',
      '**/*.js',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.mts'],

    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      jsdoc,
      '@stylistic': stylistic,
    },
    rules: {
      indent: 'off',
      '@stylistic/indent': ['error', 2],

      semi: 'off',
      '@stylistic/semi': ['error', 'always'],

      quotes: 'off',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'semi', requireLast: true },
          singleline: { delimiter: 'semi', requireLast: false },
        },
      ],
      '@stylistic/type-annotation-spacing': 'error',
      '@stylistic/brace-style': ['error', '1tbs'],

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'objectLiteralProperty',
          format: null,
        },
        {
          selector: 'classProperty',
          format: ['camelCase', 'UPPER_CASE'],
        },
      ],

      'spaced-comment': ['error', 'always', { markers: ['/'] }],
      'no-trailing-spaces': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],

      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'off',

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-namespace-keyword': 'error',
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },

  {
    files: ['test/**/*.ts', 'test/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
