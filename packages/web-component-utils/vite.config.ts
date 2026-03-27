import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

// Get all .ts files in src (excluding tests and index.ts)
const srcDir = resolve(__dirname, 'src');
const entries = readdirSync(srcDir)
  .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .reduce((acc, file) => {
    const name = file.replace('.ts', '');
    acc[name] = resolve(srcDir, file);
    return acc;
  }, {} as Record<string, string>);

export default defineConfig({
  build: {
    lib: {
      entry: entries,
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
