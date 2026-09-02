const config = {
  jsPlugins: [
    {
      name: 'maxhill',
      specifier: '@maxhill/oxlint-config/max-len-plugin',
    },
  ],
  plugins: ['eslint', 'typescript'],
  rules: {
    'maxhill/max-len': ['error', { code: 100, tabWidth: 2, ignoreUrls: true }],
    'maxhill/assertions-per-function': [
      'error',
      { minAssertions: 2, assertionFunctions: ['assert', 'invariant'] },
    ],
    curly: 'error',
    'max-lines-per-function': ['error', { max: 70, IIFEs: true }],
    'max-params': ['error', 4],
    'no-shadow': 'off',
    'typescript/no-shadow': 'error',
    'prefer-const': 'error',
    'typescript/no-floating-promises': ['error', { ignoreVoid: false }],
  },
};

export default config;
