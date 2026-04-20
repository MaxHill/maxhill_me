import { buildAssets } from "./tasks/assets.ts";
import { copyStaticFiles } from "./tasks/static.ts";
import { injectServiceWorker, generateContentHash } from "./tasks/service-worker.ts";

export interface BuildOptions {
  dev: boolean;
}

export async function runBuild(options: BuildOptions): Promise<void> {
  const { dev } = options;
  
  // 1. Clean dist/
  await cleanDist();
  
  // 2. Build JS/CSS
  const assetFiles = await buildAssets(dev);
  
  // 3. Copy static files
  const staticFiles = await copyStaticFiles();
  
  // 4. Service worker injection (production only)
  if (!dev) {
    const allFiles = [...assetFiles, ...staticFiles];
    const cacheVersion = await generateContentHash(allFiles);
    await injectServiceWorker(allFiles, cacheVersion);
    
    console.log(`✓ Cache version: ${cacheVersion}`);
    console.log(`✓ Cached ${allFiles.length} files`);
  } else {
    console.log("✓ Dev mode - service worker injection skipped");
  }
}

async function cleanDist(): Promise<void> {
  console.log("Cleaning dist/...");
  try {
    await Deno.remove("dist", { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
  await Deno.mkdir("dist", { recursive: true });
}
