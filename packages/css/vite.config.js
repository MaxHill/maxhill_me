import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function getEntryPoints() {
  const entries = {
    style: resolve(__dirname, 'src/style.css')
  };
  
  const topLevelFiles = await readdir(resolve(__dirname, 'src'), { withFileTypes: true });
  for (const file of topLevelFiles) {
    if (file.isFile() && file.name.endsWith('.css') && file.name !== 'style.css') {
      const name = file.name.replace('.css', '');
      entries[name] = resolve(__dirname, `src/${file.name}`);
    }
  }
  
  return entries;
}

export default defineConfig(async () => ({
  build: {
    cssCodeSplit: true,
    lib: {
      entry: await getEntryPoints(),
      formats: ['es']
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: '[name].[ext]'
      }
    }
  }
}));
