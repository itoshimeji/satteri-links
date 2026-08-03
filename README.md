# satteri-link-card

A small [Sätteri](https://github.com/bruits/satteri) HAST plugin that turns a
standalone URL into a link card at build time.

## Features

- 🔎 **Metadata extraction:** Reads Open Graph, Twitter Card, and standard HTML metadata
- 💾 **Metadata cache:** Keeps fetched metadata in a local file cache
- 🌐 **Favicon:** Displays favicons by default
- 🖼️ **Image cache:** Optionally caches thumbnails and favicons as local public assets
- 🛡️ **Fail-safe:** Leaves the original link unchanged when fetching fails
- 🎨 **Styling:** Ships optional preset CSS without injecting styles
- ↗️ **New tab:** Opens generated cards in a new tab by default

## Relationship to `remark-link-card-plus`

💡 `satteri-link-card` is inspired by
[`remark-link-card-plus`](https://github.com/okaryo/remark-link-card-plus).
Both turn a bare URL into a metadata-rich card, but they work at different
layers.

- The pipeline is different: `remark-link-card-plus` is a Remark/mdast plugin,
  while `satteri-link-card` is a Sätteri HAST plugin.
- The APIs are different: the concepts are similar, but the option names and
  configuration structure are not drop-in compatible.
- The cache behavior is different: `remark-link-card-plus` has one cache option,
  while `satteri-link-card` separates metadata caching from image caching.

## Install

```sh
npm install satteri-link-card satteri     # npm
yarn add satteri-link-card satteri        # yarn
pnpm add satteri-link-card satteri        # pnpm
bun add satteri-link-card satteri         # bun
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
- `.satteri-link-card__meta`
- `.satteri-link-card__host`
- `.satteri-link-card__favicon`
- `.satteri-link-card__media`
- `.satteri-link-card__image`

## Options

```ts
satteriLinkCard({
  metadataCache: {
    directory: ".cache/satteri-link-card",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
  imageCache: true,
  thumbnail: { position: "right" },
  favicon: false,
  ignoreExtensions: [".pdf", ".mp4"],
  maxResponseBytes: 1024 * 1024,
  openInNewTab: true,
  timeout: 5000,
});
```

| Option                    | Default                    | Description                                                          |
| ------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `metadataCache`           | `{}`                       | Metadata cache settings, or `false` to disable metadata caching.     |
| `metadataCache.directory` | `.cache/satteri-link-card` | Directory for JSON metadata files.                                   |
| `metadataCache.maxAge`    | 30 days                    | Maximum cache age in milliseconds, or `false` to never expire.       |
| `imageCache`              | `false`                    | Enables the filesystem image cache, or accepts custom store options. |
| `thumbnail`               | `{ position: "right" }`    | Sets thumbnail position, or `false` to omit the thumbnail.           |
| `favicon`                 | enabled                    | Set to `false` to omit favicon discovery and rendering.              |
| `shortenUrl`              | `true`                     | Displays only the hostname instead of the full URL.                  |
| `ignoreExtensions`        | `[]`                       | Leaves URLs with these path extensions unchanged.                    |
| `transformMetadata`       | `undefined`                | Transforms fetched metadata before rendering and asset caching.      |
| `fetch`                   | `globalThis.fetch`         | Custom Fetch implementation, useful for testing or access control.   |
| `maxResponseBytes`        | 1 MiB                      | Maximum HTML response size.                                          |
| `openInNewTab`            | `true`                     | Adds `target="_blank"` and `rel="noopener noreferrer"`.              |
| `timeout`                 | 5000 ms                    | Metadata and image request timeout.                                  |

`imageCache: true` writes assets to `public/satteri-link-card/` and renders
them from `/satteri-link-card/`. It caches both Open Graph images and favicons.
The default is `false`, so an environment without a `public/` convention can
continue to use remote assets.

To customize the filesystem location, use the built-in store:

```ts
import { createFileSystemImageCacheStore, satteriLinkCard } from "satteri-link-card";

satteriLinkCard({
  imageCache: {
    store: createFileSystemImageCacheStore({
      directory: "static/link-cards",
      publicPath: "/link-cards",
    }),
  },
});
```

Other backends can implement the exported `ImageCacheStore` interface and be
passed as `imageCache.store`.

The initial image cache accepts common raster formats and ICO favicons. SVG
assets are not cached in this release. Cache failures fall back to the remote
asset URL, while metadata failures leave the original link unchanged.

## Security

Metadata and image fetching happen in the build environment. Use this plugin
with trusted Markdown, or provide a restricted `fetch` implementation when
URLs can come from untrusted authors. The plugin does not currently block
requests to private or local network addresses.

## Roadmap

- [x] Require Node.js 22 or newer and test maintained Node.js versions in CI.
- [x] Add useful `remark-link-card-plus`-compatible settings without changing
      the standalone bare-URL rule.
- [x] Replace separate negative thumbnail settings with
      `thumbnail: false | ThumbnailOptions`.
- [x] Add favicon rendering by default, with `favicon: false` as the initial
      opt-out.
- [x] Separate the metadata cache from an opt-in `imageCache` and a pluggable
      `ImageCacheStore`.
- [x] Cache images and favicons under `public/satteri-link-card/` when
      `imageCache: true` is enabled.
- [x] Add bounded asset downloads, media-type validation, atomic writes, and
      an explicit SVG policy.
- [ ] Add concurrency limits across different URLs, stale-on-error, and
      offline builds.
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
