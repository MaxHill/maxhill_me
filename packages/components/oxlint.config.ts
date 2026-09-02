import { defineConfig } from 'oxlint';
import sharedConfig from '@maxhill/oxlint-config';

export default defineConfig({
  ...sharedConfig,
  rules: {
    ...sharedConfig.rules,
    'maxhill/assertions-per-function': 'off',
  },
});
