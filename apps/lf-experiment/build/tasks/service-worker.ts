import { join } from "@std/path";

export async function generateContentHash(filePaths: string[]): Promise<string> {
  console.log("Generating content hash...");
  
  const sorted = filePaths.sort();
  const encoder = new TextEncoder();
  const hashParts: Uint8Array[] = [];
  
  for (const filePath of sorted) {
    // Hash filename
    hashParts.push(encoder.encode(filePath));
    hashParts.push(encoder.encode("\n"));
    
    // Hash file content
    const fullPath = join("dist", filePath.substring(1));
    const content = await Deno.readFile(fullPath);
    hashParts.push(content);
    hashParts.push(encoder.encode("\n"));
  }
  
  // Combine all parts
  const totalLength = hashParts.reduce((sum, arr) => sum + arr.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of hashParts) {
    combined.set(part, offset);
    offset += part.length;
  }
  
  // SHA-256 hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  
  return hashHex.substring(0, 12);
}

export async function injectServiceWorker(
  filesToCache: string[],
  cacheVersion: string
): Promise<void> {
  console.log("Injecting service worker...");
  
  const swPath = "dist/service-worker.js";
  let content = await Deno.readTextFile(swPath);
  
  // Replace placeholders
  content = content.replace(
    '"cache_name_placeholder"',
    `"${cacheVersion}"`
  );
  
  content = content.replace(
    '["assets_to_cache_placeholder"]',
    JSON.stringify(filesToCache, null, 2)
  );
  
  await Deno.writeTextFile(swPath, content);
}
