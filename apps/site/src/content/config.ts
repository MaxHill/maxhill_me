import { defineCollection, z } from "astro:content";

const documentation = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    author: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()),
  }),
});

export const collections = {
  documentation,
};
