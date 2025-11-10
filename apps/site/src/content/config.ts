import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const documentation = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    author: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()),
    htmlId: z.string(),
  }),
});

const componentDocs = defineCollection({
  loader: glob({ 
    pattern: "*/DOCS.mdx", 
    base: path.resolve(__dirname, "../../../../packages/components/src")
  }),
});

export const collections = {
  documentation,
  componentDocs,
};
