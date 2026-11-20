import { defineConfig } from 'oxlint';
import sharedConfig from '@maxhill/oxlint-config';

export default defineConfig({
  ...sharedConfig,
  ignorePatterns: ['src/index.js'],
  rules: {
    ...sharedConfig.rules,
    // These adapters forward IndexedDB events; they do not own data invariants.
    'maxhill/assertions-per-function': 'off',
  },
});
