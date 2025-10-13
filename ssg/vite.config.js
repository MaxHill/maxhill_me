import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'assets/built',
    rollupOptions: {
      input: {
        main: 'assets/js/main.ts',
        style: 'assets/css/style.css'
      },
      output: {
        entryFileNames: 'js/[name].js',
        assetFileNames: 'css/[name].css'
      }
    }
  }
});
