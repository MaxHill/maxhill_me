import { join } from "@std/path";

export async function copyStaticFiles(): Promise<string[]> {
  const copiedFiles: string[] = [];
  
  // Copy index.html
  console.log("Copying index.html...");
  await Deno.copyFile("index.html", "dist/index.html");
  copiedFiles.push("/index.html");
  
  // Copy favicon
  console.log("Copying favicon...");
  await Deno.copyFile("favicon.svg", "dist/favicon.svg");
  copiedFiles.push("/favicon.svg");
  
  // Copy fonts
  console.log("Copying fonts...");
  await Deno.mkdir("dist/fonts/optimized", { recursive: true });
  
  const fontsSourceDir = "../site/public/fonts/optimized";
  for await (const entry of Deno.readDir(fontsSourceDir)) {
    if (entry.isFile) {
      const srcPath = join(fontsSourceDir, entry.name);
      const destPath = join("dist/fonts/optimized", entry.name);
      await Deno.copyFile(srcPath, destPath);
      copiedFiles.push(`/fonts/optimized/${entry.name}`);
    }
  }
  
  console.log(`✓ Copied ${copiedFiles.length} static files`);
  return copiedFiles;
}
