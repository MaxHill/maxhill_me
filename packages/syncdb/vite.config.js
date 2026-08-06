import { defineConfig } from 'vite';
import { resolve } from 'path';

const isWatchMode = process.argv.includes('--watch');

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    outDir: 'dist',
    emptyOutDir: !isWatchMode,
    rollupOptions: {
      external: ['idb'],
      output: {
        preserveModules: false
      }
    }
  }
});
