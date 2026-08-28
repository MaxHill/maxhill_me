import { defineConfig } from 'oxlint';
import sharedConfig from '@maxhill/oxlint-config';

export default defineConfig({
  ...sharedConfig,
  options: {
    typeAware: true,
  },
  ignorePatterns: [
    '**/dist/**',
    '**/.astro/**',
    '**/node_modules/**',
    '**/coverage/**',
  ],
});
