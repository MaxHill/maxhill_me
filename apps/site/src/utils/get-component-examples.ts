import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ComponentExample {
  slug: string;
  order: number;
  html: string;
  css?: string | undefined;
  js?: string | undefined;
  explanation?: string | undefined;
}

const DEFAULT_COMPONENTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/components/src"
);

function parseFolder(folderName: string): { order: number; slug: string } {
  const match = folderName.match(/^(\d+)-(.+)$/);
  if (match) {
    return { order: parseInt(match[1], 10), slug: match[2] };
  }
  return { order: 0, slug: folderName };
}

function readOptionalFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

export function getExamplesForComponent(tagName: string, basePath = DEFAULT_COMPONENTS_DIR): ComponentExample[] {
  const examplesDir = path.join(basePath, tagName, "examples");

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(examplesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = entries.filter((e) => e.isDirectory());

  const examples: ComponentExample[] = [];

  for (const folder of folders) {
    const folderPath = path.join(examplesDir, folder.name);
    const htmlPath = path.join(folderPath, "index.html");

    let html: string;
    try {
      html = fs.readFileSync(htmlPath, "utf-8");
    } catch {
      continue;
    }

    const { order, slug } = parseFolder(folder.name);

    examples.push({
      slug,
      order,
      html,
      css: readOptionalFile(path.join(folderPath, "index.css")),
      js: readOptionalFile(path.join(folderPath, "index.js")),
      explanation: readOptionalFile(path.join(folderPath, "explanation.md")),
    });
  }

  return examples.sort((a, b) => a.order - b.order);
}

export function getAllComponentExamples(basePath = DEFAULT_COMPONENTS_DIR): Map<string, ComponentExample[]> {
  const result = new Map<string, ComponentExample[]>();

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return result;
  }

  const componentDirs = entries.filter((e) => e.isDirectory());

  for (const dir of componentDirs) {
    const examples = getExamplesForComponent(dir.name, basePath);
    if (examples.length > 0) {
      result.set(dir.name, examples);
    }
  }

  return result;
}
