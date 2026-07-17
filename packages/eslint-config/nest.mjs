import globals from 'globals';

import baseConfig from './base.mjs';

const nestConfig = [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },
];

export { nestConfig };
export default nestConfig;
