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
