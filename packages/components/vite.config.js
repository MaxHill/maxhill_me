import { defineConfig } from 'vite';
import { resolve } from 'path';
import { glob } from 'glob';

const entries = Object.fromEntries(
  glob.sync('src/**/index.ts')
    .concat('src/register-all.ts')
    .map(file => {
      const entry = file.replace('src/', '').replace('/index.ts', '').replace('.ts', '');
      return [entry, resolve(__dirname, file)];
    })
);

const isWatchMode = process.argv.includes('--watch');

export default defineConfig({
  build: {
    lib: {
      entry: entries,
      formats: ['es']
    },
    outDir: 'dist',
    emptyOutDir: !isWatchMode,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});
