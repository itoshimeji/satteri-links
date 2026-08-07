// @ts-check
import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "static",
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
