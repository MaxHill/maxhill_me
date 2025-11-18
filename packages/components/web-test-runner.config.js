import { playwrightLauncher } from '@web/test-runner-playwright';
import { esbuildPlugin } from '@web/dev-server-esbuild';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to handle .css?inline imports (Vite-style)
const cssInlinePlugin = () => ({
  name: 'css-inline',
  serve(context) {
    if (context.path.endsWith('.css')) {
      const fullPath = resolve(__dirname, context.path.slice(1));
      
      try {
        const cssContent = readFileSync(fullPath, 'utf-8');
        return {
          body: `export default ${JSON.stringify(cssContent)};`,
          type: 'js',
        };
      } catch (err) {
        console.error(`Failed to read CSS file: ${fullPath}`, err);
        return {
          body: `export default '';`,
          type: 'js',
        };
      }
    }
  },
  resolveImport({ source }) {
    if (source.endsWith('?inline')) {
      return source.replace('?inline', '');
    }
  },
});

export default {
  files: 'src/**/*.test.ts',
  nodeResolve: true,
  plugins: [
    esbuildPlugin({ 
      ts: true,
      tsx: false,
      target: 'auto',
      tsconfig: './tsconfig.json',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    }),
    cssInlinePlugin(),
  ],
  coverageConfig: {
    report: true,
    reportDir: 'coverage',
  },
  testFramework: {
    config: {
      ui: 'bdd',
      timeout: 5000,
    },
  },
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
  ],
  filterBrowserLogs: (log) => {
    return !log.args.some(arg => 
      typeof arg === 'string' && arg.includes('Lit is in dev mode')
    );
  },
  testsFinishTimeout: 30000,
  browserStartTimeout: 30000,
  testRunnerHtml: testFramework => `
    <!DOCTYPE html>
    <html>
      <head></head>
      <body>
        <script type="module" src="${testFramework}"></script>
      </body>
    </html>
  `,
};
