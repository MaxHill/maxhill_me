import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'card-element': resolve(__dirname, 'src/card-element.ts')
      },
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
