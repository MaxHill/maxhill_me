#!/usr/bin/env -S deno run --allow-all

import { runBuild } from "./build/main.ts";
import { serveDir } from "@std/http/file-server";

const PORT = 8080;

console.log("Starting development mode...\n");

// Run initial build
await runBuild({ dev: true });

console.log("\n✓ Initial build complete");
console.log(`✓ Starting dev server on http://localhost:${PORT}...\n`);

// Start dev server directly (verbose logging)
Deno.serve({ port: PORT }, async (req) => {
  const response = await serveDir(req, {
    fsRoot: "dist",
    quiet: false,  // Show request logs
  });
  
  // SPA fallback
  if (response.status === 404) {
    const html = await Deno.readTextFile("dist/index.html");
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  
  return response;
});
