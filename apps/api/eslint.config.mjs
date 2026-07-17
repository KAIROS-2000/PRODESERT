import nestConfig from '@pro-dessert/eslint-config/nest';

export default [
  ...nestConfig,
  {
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      // Nest relies on runtime constructor and DTO metadata. Auto-fixing these
      // imports to `import type` erases the tokens that decorators consume.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
