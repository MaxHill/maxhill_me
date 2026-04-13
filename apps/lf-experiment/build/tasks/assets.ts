import * as esbuild from "npm:esbuild@0.20.0";

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
    target: "esnext",  // Changed from es2020 to support decorators
    format: "esm",
    minify: !dev,
    sourcemap: dev,
    metafile: true,
    loader: {
      ".css": "text",   // For Shadow DOM
      ".html": "text",  // For Shadow DOM
    },
  });
  
  // Collect JS outputs (exclude service-worker.js and .map)
  for (const outputPath of Object.keys(jsResult.metafile!.outputs)) {
    if (!outputPath.endsWith(".map") && !outputPath.includes("service-worker")) {
      filesToCache.push("/" + outputPath.replace("dist/", ""));
    }
  }
  
  console.log("Building CSS...");
  const cssResult = await esbuild.build({
    entryPoints: ["src/main.css"],
    bundle: true,
    outfile: "dist/css/style.css",
    minify: !dev,
    metafile: true,
    loader: { ".css": "css" },
    external: ["/fonts/*"],
  });
  
  // Collect CSS outputs
  for (const outputPath of Object.keys(cssResult.metafile!.outputs)) {
    if (!outputPath.endsWith(".map")) {
      filesToCache.push("/" + outputPath.replace("dist/", ""));
    }
  }
  
  esbuild.stop();
  
  console.log(`✓ Bundled ${filesToCache.length} asset files`);
  return filesToCache;
}
