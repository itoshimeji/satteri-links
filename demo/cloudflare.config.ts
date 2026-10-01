import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "satteri-links-demo",
    compatibilityDate: "2026-08-07",
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
    domains: ["satteri-links.hamazaki.me"],
  },
});
