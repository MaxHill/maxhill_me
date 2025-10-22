// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],
  vite: {
    server: {
      watch: {
        ignored: ['!**/node_modules/@maxhill/**']
      }
    }
  }
});
