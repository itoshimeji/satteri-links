# Satteri Links Demo

Astro demo for the packages in this repository.

Run the workspace development task from the repository root. It builds the
package dependencies once, then starts their build watchers and the Astro dev
server together:

```sh
pnpm dev
```

Pages are defined in `src/pages/` and deployed to
<https://satteri-links.hamazaki.me>.

## Browser end-to-end tests

Install workspace dependencies and Playwright's Chromium browser first:

```sh
pnpm install --frozen-lockfile
pnpm --filter satteri-links-demo exec playwright install chromium
```

From the repository root, run the complete suite:

```sh
pnpm test:e2e
```

The script always builds the workspace packages without task-cache reuse, then
builds the real Astro demo in production mode with `SATTERI_E2E=1`. Existing MDX
routes use deterministic build-time metadata, disabled metadata/image caches and
local SVG images. The browser still exercises the packages' built exports, the
normal Markdown pipeline and their shipped preset CSS. No browser metadata API
is mocked, and unexpected external browser requests fail the tests.

The fixture build uses `dist-e2e/` and an isolated `.e2e/` public/cache directory.
It does not overwrite normal `dist/`, `public/`, metadata caches or Cloudflare
output. Playwright starts and stops its own Astro production preview at
`http://127.0.0.1:4173`; it refuses to reuse an existing server on that address.

Eight tests run in desktop Chromium and mobile Chromium with touch emulation.
They cover page navigation/history and active navigation, card/mention metadata
and option variants, loaded local images, untouched authored links, metadata
failure fallbacks, keyboard-operable heading permalinks, and narrow/touch layout.
Scheduler and concurrency behavior remain covered by the package unit tests.
CI uses one worker, one retry, and treats flaky tests as failures. Failed tests
retain traces and screenshots in `test-results/`; the HTML report is written to
`playwright-report/`.

For a constrained local environment with an existing Chromium installation, an
optional executable override is available. CI leaves it unset to use the browser
version matching the pinned Playwright dependency:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:e2e
```

For interactive debugging, first run the fresh build, then pass flags directly
to Playwright (its configuration still manages the preview server):

```sh
pnpm --filter satteri-links-demo build:e2e
pnpm --filter satteri-links-demo exec playwright test --project=chromium --debug
pnpm --filter satteri-links-demo exec playwright show-report
```

## Cloudflare deployment

Use Node.js 22 (22.18+), 24 (24.11+), or 26+ and install the workspace dependencies first.
The demo remains a static Astro site. `cloudflare.config.ts` preserves its Worker
name, custom domain, compatibility date, and asset routing, while
`wrangler.config.ts` points the Cloudflare builder at Astro's `dist` directory.

From the repository root, validate the deployment without credentials or uploads:

```sh
pnpm --filter satteri-links-demo deploy:check
```

The build runs the workspace packages and Astro first, then calls Cloudflare's
`cf-wrangler build` delegate to create `.cloudflare/output/v0/`. This explicit
delegate is needed because the `cf` beta otherwise detects Astro and invokes
`astro build`, whose static output does not include Cloudflare Build Output.
The pinned `cf` and Wrangler versions keep this beta integration reproducible.

When ready to deploy with your existing Cloudflare credentials:

```sh
pnpm --filter satteri-links-demo deploy
```

This builds the same output and deploys it with `cf deploy --prebuilt`. `pnpm dev`
and the demo's `preview` script continue to use Astro.

The legacy `wrangler.jsonc` is retained as a fallback until the first successful
`cf` deployment. `cf` ignores it because `cloudflare.config.ts` exists. Remove it
after verifying the first deployment and switching any remaining Wrangler
commands, following the [Cloudflare migration guide](https://developers.cloudflare.com/cf/wrangler/migrate/#remove-the-wrangler-configuration).

Run the configuration and script regression tests with:

```sh
pnpm --filter satteri-links-demo test:deploy
```
