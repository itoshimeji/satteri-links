// @ts-check
import { mergeConfig } from "astro/config";
import demoConfig from "./astro.config.mjs";

// Reuse the real demo routes, Markdown pipeline, workspace exports and CSS.
// Test fixtures and generated assets stay separate from deployable output.
export default mergeConfig(demoConfig, {
  outDir: "./dist-e2e",
  publicDir: "./.e2e/public",
  cacheDir: "./.e2e/cache",
});
