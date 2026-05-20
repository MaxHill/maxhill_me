import fs from "node:fs";
import path from "node:path";

export interface ComponentExample {
  slug: string;
  order: number;
  html: string;
  css?: string;
  js?: string;
  explanation?: string;
}

const COMPONENTS_DIR = path.resolve(
  path.dirname(import.meta.url.replace("file://", "")),
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

export function getExamplesForComponent(tagName: string): ComponentExample[] {
  const examplesDir = path.join(COMPONENTS_DIR, tagName, "examples");

  if (!fs.existsSync(examplesDir)) {
    return [];
  }

  const entries = fs.readdirSync(examplesDir, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory());

  const examples: ComponentExample[] = [];

  for (const folder of folders) {
    const folderPath = path.join(examplesDir, folder.name);
    const htmlPath = path.join(folderPath, "index.html");

    if (!fs.existsSync(htmlPath)) {
      continue;
    }

    const { order, slug } = parseFolder(folder.name);
    const html = fs.readFileSync(htmlPath, "utf-8");

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

export function getAllComponentExamples(): Map<string, ComponentExample[]> {
  const result = new Map<string, ComponentExample[]>();

  if (!fs.existsSync(COMPONENTS_DIR)) {
    return result;
  }

  const entries = fs.readdirSync(COMPONENTS_DIR, { withFileTypes: true });
  const componentDirs = entries.filter((e) => e.isDirectory());

  for (const dir of componentDirs) {
    const examples = getExamplesForComponent(dir.name);
    if (examples.length > 0) {
      result.set(dir.name, examples);
    }
  }

  return result;
}
