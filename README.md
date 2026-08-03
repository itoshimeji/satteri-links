# satteri-link-card

A small [Sätteri](https://github.com/bruits/satteri) HAST plugin that turns a
standalone URL into a link card at build time.

- Reads Open Graph, Twitter Card, and standard HTML metadata
- Keeps fetched metadata in a local file cache
- Leaves the original link unchanged when fetching fails
- Ships optional preset CSS without injecting styles
- Opens generated cards in a new tab by default

## Install

```sh
npm install satteri-link-card satteri
```

## Use with Sätteri

```ts
import { markdownToHtml } from "satteri";
import { satteriLinkCard } from "satteri-link-card";

const result = await markdownToHtml("https://example.com/article", {
  hastPlugins: [satteriLinkCard()],
});
```

The plugin transforms only a bare HTTP or HTTPS URL in a root-level paragraph.
Explicit Markdown links, inline URLs, and URLs inside lists are left alone.

## Use with Astro

Install and configure `@astrojs/markdown-satteri`,
then add the plugin to `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { satteriLinkCard } from "satteri-link-card";

export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [satteriLinkCard()],
    }),
  },
});
```

## Styling

The plugin outputs class names but does not inject CSS. Import the optional
preset once from a layout or other global stylesheet entry:

```js
import "satteri-link-card/preset.css";
```

You can replace the preset entirely, or override these stable classes:

- `.satteri-link-card`
- `.satteri-link-card__body`
- `.satteri-link-card__title`
- `.satteri-link-card__description`
- `.satteri-link-card__host`
- `.satteri-link-card__media`
- `.satteri-link-card__image`

## Options

```ts
satteriLinkCard({
  cache: {
    directory: ".cache/satteri-link-card",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
  maxResponseBytes: 1024 * 1024,
  openInNewTab: true,
  timeout: 5000,
});
```

| Option             | Default                    | Description                                                        |
| ------------------ | -------------------------- | ------------------------------------------------------------------ |
| `cache`            | `{}`                       | Metadata cache settings, or `false` to disable caching.            |
| `cache.directory`  | `.cache/satteri-link-card` | Directory for JSON metadata files.                                 |
| `cache.maxAge`     | 30 days                    | Maximum cache age in milliseconds, or `false` to never expire.     |
| `fetch`            | `globalThis.fetch`         | Custom Fetch implementation, useful for testing or access control. |
| `maxResponseBytes` | 1 MiB                      | Maximum HTML response size.                                        |
| `openInNewTab`     | `true`                     | Adds `target="_blank"` and `rel="noopener noreferrer"`.            |
| `timeout`          | 5000 ms                    | Metadata request timeout.                                          |

The cache contains metadata only. Remote images remain remote and are not
downloaded. Favicons are not rendered in the initial release.

## Security

Metadata fetching happens in the build environment. Use this plugin with
trusted Markdown, or provide a restricted `fetch` implementation when URLs can
come from untrusted authors. The plugin does not currently block requests to
private or local network addresses.

## Roadmap

See [the detailed roadmap](./docs/roadmap.md) for design decisions, compatibility
scope, and the planned cache architecture.

- [x] Require Node.js 22 or newer and test maintained Node.js versions in CI.
- [ ] Add useful `remark-link-card-plus`-compatible settings without changing
      the standalone bare-URL rule.
- [x] Replace separate negative thumbnail settings with
      `thumbnail: false | ThumbnailOptions`.
- [ ] Add favicon rendering by default, with `favicon: false` as the initial
      opt-out.
- [ ] Separate the metadata cache from a pluggable public `AssetStore`.
- [ ] Cache images and favicons under `public/satteri-link-card/` by default.
- [ ] Add bounded asset downloads, media-type validation, and an explicit SVG
      policy.
- [ ] Add failure reporting, concurrency limits, stale-on-error, and offline
      builds.
- [ ] Add explicit cache pruning and strengthen the build-time network security
      policy.

## Development

```sh
vp install
vp check
vp test
vp pack
```

## License

[MIT](./LICENSE)
