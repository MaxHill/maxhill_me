import * as esbuild from "esbuild";

export async function buildAssets(dev: boolean): Promise<string[]> {
  const filesToCache: string[] = [];
  
  console.log("Building JavaScript...");
  const jsResult = await esbuild.build({
    entryPoints: {
      "js/main": "src/main.ts",
      "service-worker": "src/service-worker.ts",
    },
    bundle: true,
    outdir: "dist",
    platform: "browser",
    target: "esnext",
    format: "esm",
    minify: !dev,
    sourcemap: dev,
    metafile: true,
    loader: {
      ".css": "text",   // For Shadow DOM and inline CSS imports
      ".html": "text",  // For Shadow DOM
    },
  });
  
  // Collect JS outputs (exclude service-worker.js and .map)
  for (const outputPath of Object.keys(jsResult.metafile!.outputs)) {
    if (!outputPath.endsWith(".map") && !outputPath.includes("service-worker")) {
      filesToCache.push("/" + outputPath.replace("dist/", ""));
    }
  }
  
  esbuild.stop();
  
  console.log(`✓ Bundled ${filesToCache.length} asset files`);
  return filesToCache;
}
