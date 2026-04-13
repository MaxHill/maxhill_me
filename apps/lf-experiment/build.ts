#!/usr/bin/env -S deno run --allow-all

import { runBuild } from "./build/main.ts";

console.log("Building for production...\n");

try {
  await runBuild({ dev: false });
  console.log("\n✓ Production build complete!");
  console.log("  Output: dist/");
} catch (error) {
  console.error("Build failed:", error);
  Deno.exit(1);
}
