import { defineConfig } from 'vite';
import { resolve } from 'path';
import { glob } from 'glob';

const entries = Object.fromEntries(
  glob.sync('src/**/index.ts')
    .map(file => {
      const entry = file.replace('src/', '').replace('/index.ts', '');
      return [entry, resolve(__dirname, file)];
    })
);

export default defineConfig({
  build: {
    lib: {
      entry: entries,
      formats: ['es']
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});
