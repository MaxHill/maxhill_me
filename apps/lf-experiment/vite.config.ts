import { defineConfig, type Plugin } from "vite";
import { resolve, join, relative } from "node:path";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Walk a directory recursively, returning absolute file paths.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Copy fonts from @maxhill/css/public/fonts into dist/fonts at build time
 * and into Vite's dev middleware via configureServer (served from /fonts/...).
 */
function copyFontsPlugin(): Plugin {
  // Resolve the @maxhill/css package directory. Resolve a known asset that the
  // exports map permits ("./fonts/*"), then walk back up to the package root.
  const fontsSource = (() => {
    const fontFile = require.resolve(
      "@maxhill/css/fonts/optimized/IBMPlexMono-Regular.woff2",
    );
    // .../packages/css/public/fonts/optimized/IBMPlexMono-Regular.woff2
    return resolve(fontFile, "..", "..");
  })();

  return {
    name: "copy-fonts",
    apply: () => true,
    configureServer(server) {
      // Serve /fonts/* from the css package's public dir during dev
      server.middlewares.use("/fonts", (req, res, next) => {
        if (!req.url) return next();
        const requested = join(fontsSource, req.url.split("?")[0]);
        if (!requested.startsWith(fontsSource)) return next(); // path traversal guard
        if (!existsSync(requested) || !statSync(requested).isFile()) return next();
        const ext = requested.split(".").pop()!;
        const contentType =
          ext === "woff2"
            ? "font/woff2"
            : ext === "woff"
              ? "font/woff"
              : "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        res.end(readFileSync(requested));
      });
    },
    closeBundle() {
      const target = resolve(__dirname, "dist/fonts");
      if (!existsSync(fontsSource)) return;
      mkdirSync(target, { recursive: true });
      cpSync(fontsSource, target, { recursive: true });
    },
  };
}

/**
 * After bundling, walk dist/, build a SHA-256 cache version, and replace the
 * placeholders in dist/service-worker.js.
 */
function serviceWorkerCachePlugin(): Plugin {
  return {
    name: "service-worker-cache",
    apply: "build",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      const swPath = join(distDir, "service-worker.js");

      if (!existsSync(swPath)) {
        this.warn("service-worker.js not found in dist; skipping injection");
        return;
      }

      // Collect all served files (relative URLs starting with "/").
      const allFiles = walk(distDir)
        .map((abs) => "/" + relative(distDir, abs).split("\\").join("/"))
        // Exclude source maps and the SW itself
        .filter(
          (p) =>
            !p.endsWith(".map") &&
            p !== "/service-worker.js" &&
            p !== "/metafile.json",
        )
        .sort();

      // Hash content (filename + content), matching prior algorithm
      const hash = createHash("sha256");
      for (const rel of allFiles) {
        hash.update(rel + "\n");
        hash.update(readFileSync(join(distDir, rel)));
        hash.update("\n");
      }
      const cacheVersion = hash.digest("hex").substring(0, 12);

      let content = readFileSync(swPath, "utf8");
      content = content.replace('"cache_name_placeholder"', `"${cacheVersion}"`);
      content = content.replace(
        '["assets_to_cache_placeholder"]',
        JSON.stringify(allFiles, null, 2),
      );
      writeFileSync(swPath, content);

      console.log(`✓ Service worker cache version: ${cacheVersion}`);
      console.log(`✓ Pre-caching ${allFiles.length} files`);
    },
  };
}

export default defineConfig({
  server: {
    port: 8080,
  },
  build: {
    outDir: "dist",
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "service-worker": resolve(__dirname, "src/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "service-worker"
            ? "service-worker.js"
            : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [copyFontsPlugin(), serviceWorkerCachePlugin()],
});
