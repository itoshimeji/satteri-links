import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import cloudflareConfig from "../demo/cloudflare.config.ts";
import wranglerConfig from "../demo/wrangler.config.ts";

const manifest = JSON.parse(
  await readFile(new URL("../demo/package.json", import.meta.url), "utf8"),
);

void test("the Cloudflare migration preserves the static Worker's deployment settings", () => {
  assert.deepEqual(cloudflareConfig, {
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
  assert.deepEqual(wranglerConfig, {
    assetsDirectory: "./dist",
    types: { generate: false },
  });
});

void test("deployment builds workspace assets before generating and deploying Cloudflare Build Output", () => {
  assert.equal(manifest.scripts["build:workspace"], "vp run --cache -t build");
  assert.equal(
    manifest.scripts["build:cloudflare"],
    "pnpm run build:workspace && cf-wrangler build",
  );
  assert.equal(manifest.scripts.deploy, "pnpm run build:cloudflare && cf deploy --prebuilt");
  assert.equal(
    manifest.scripts["deploy:check"],
    "pnpm run build:cloudflare && cf deploy --prebuilt --dry-run",
  );
  assert.equal(manifest.scripts.dev, "astro dev");
  assert.equal(manifest.scripts.build, "astro build");
  assert.equal(manifest.scripts.preview, "astro preview");
});

void test("the beta Cloudflare tooling is pinned and only needed for development", () => {
  assert.equal(manifest.devDependencies.cf, "1.0.0-beta.9");
  assert.equal(manifest.devDependencies.wrangler, "4.145.0");
  assert.equal(manifest.dependencies.cf, undefined);
  assert.equal(manifest.dependencies.wrangler, undefined);
  assert.equal(manifest.engines.node, "^22.18.0 || ^24.11.0 || >=26.0.0");
});
