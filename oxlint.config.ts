import { defineConfig } from 'oxlint';
import sharedConfig from '@maxhill/oxlint-config';

export default defineConfig({
  ...sharedConfig,
  options: {
    typeAware: true,
  },
  overrides: [
    ...(sharedConfig.overrides ?? []),
    {
      // These entry points orchestrate commands. Dax rejects failed commands;
      // input and remote-command invariants belong to vps/utils.ts, not build callbacks.
      files: [
        'vps/auth/deploy.ts',
        'vps/golf/deploy.ts',
        'vps/site/deploy.ts',
        'vps/bootstrap-remote.ts',
        'vps/litestream/deploy-remote.ts',
        // This HTTP entry point validates required env and the response at top level.
        // Its only function is the fallback for reading an error response body.
        'vps/alert-on-failure/alert-on-failure.ts',
      ],
      rules: { 'maxhill/assertions-per-function': 'off' },
    },
    {
      // Plop owns prompt validation; registration, predicates, and template mapping
      // do not each own two data invariants. Keep the prompt validators explicit.
      files: ['plopfile.js'],
      rules: { 'maxhill/assertions-per-function': 'off' },
    },
    {
      // Geometry boundaries have explicit assertions. Regex callbacks, color
      // predicates, formatting, and CLI I/O do not each own two invariants.
      files: ['scripts/dither-svg/index.ts'],
      rules: { 'maxhill/assertions-per-function': 'off' },
    },
  ],
  ignorePatterns: [
    // Apps and packages run lint with their own configs and type-aware settings.
    'apps/',
    'packages/',
    '**/dist/**',
    '**/.astro/**',
    '**/node_modules/**',
    '**/coverage/**',
  ],
});
