// @ts-check
import mdx from "@astrojs/mdx";
import { satteri, satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { satteriHeadingLink } from "satteri-heading-link";

// https://astro.build/config
export default defineConfig({
  site: "https://satteri-links.hamazaki.me",
  trailingSlash: "always",
  integrations: [mdx(), sitemap()],
  markdown: {
    processor: satteri({
      hastPlugins: [() => satteriHeadingIdsPlugin(), satteriHeadingLink()],
    }),
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
