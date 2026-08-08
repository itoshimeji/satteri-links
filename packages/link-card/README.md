# 🌌 satteri-link-card

A Sätteri HAST plugin that turns a standalone URL into a link card at build
time.

> [!WARNING]
> This package is experimental. Its API, generated HTML, CSS class names, and
> behavior may change incompatibly between releases.

[View live examples](https://satteri-links.hamazaki.me/link-card/).

## ✨ Features

- Resolves Open Graph, Twitter Card, and standard HTML metadata
- Displays a title, description, hostname, favicon, and thumbnail when available
- Caches metadata locally by default
- Optionally caches thumbnails and favicons as public assets
- Leaves the original link unchanged when metadata cannot be resolved
- Provides optional preset CSS without injecting styles

## 📦 Installation

```sh
pnpm add satteri-link-card satteri
```

Node.js 22 or newer is required.

## 🚀 Sätteri setup

```ts
import { markdownToHtml } from "satteri";
import { satteriLinkCard } from "satteri-link-card";

const result = await markdownToHtml("https://example.com/article", {
  hastPlugins: [satteriLinkCard()],
});
```

Only a bare HTTP or HTTPS URL in a root-level paragraph is converted. Explicit
Markdown links, inline URLs, and URLs nested in lists or blockquotes are left
unchanged.

## 🌌 Astro setup

Install the Astro processor and configure it in `astro.config.mjs`:

```sh
pnpm add @astrojs/markdown-satteri satteri satteri-link-card
```

```js
import { satteri } from "@astrojs/markdown-satteri";
import { defineConfig } from "astro/config";
import { satteriLinkCard } from "satteri-link-card";

export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [satteriLinkCard()],
    }),
  },
});
```

The plugin then processes Markdown rendered by Astro.

## 🎨 Styling

The plugin emits class names but does not inject CSS. Import the optional preset
once from a shared Astro layout or another global stylesheet entry:

```astro
---
import "satteri-link-card/preset.css";
---
```

You can omit the preset and define the styles yourself. The generated elements
use these stable classes for the current release:

- `.satteri-link-card`
- `.satteri-link-card__body`
- `.satteri-link-card__title`
- `.satteri-link-card__description`
- `.satteri-link-card__meta`
- `.satteri-link-card__host`
- `.satteri-link-card__favicon`
- `.satteri-link-card__media`
- `.satteri-link-card__image`

## ⚙️ Options

```ts
satteriLinkCard({
  metadataCache: {
    directory: ".cache/satteri-link-card",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
  imageCache: true,
  thumbnail: { position: "right" },
  favicon: false,
  shortenUrl: true,
  ignoreExtensions: [".pdf", ".mp4"],
  openInNewTab: true,
});
```

| Option                     | Default                    | Description                                                         |
| -------------------------- | -------------------------- | ------------------------------------------------------------------- |
| `metadataCache`            | `{}`                       | Metadata cache settings, or `false` to disable the cache.           |
| `metadataCache.directory`  | `.cache/satteri-link-card` | Directory for cached metadata files.                                |
| `metadataCache.maxAge`     | 30 days                    | Maximum age in milliseconds, or `false` to never expire.            |
| `imageCache`               | `false`                    | Enables the filesystem image cache or accepts custom store options. |
| `imageCache.maxImageBytes` | 5 MiB                      | Maximum download size for one cached image.                         |
| `thumbnail`                | `{ position: "right" }`    | Sets the thumbnail position; use `false` to omit it.                |
| `favicon`                  | enabled                    | Use `false` to omit favicon discovery and rendering.                |
| `shortenUrl`               | `true`                     | Shows only the hostname instead of the full URL.                    |
| `ignoreExtensions`         | `[]`                       | Leaves URLs with matching path extensions unchanged.                |
| `transformMetadata`        | `undefined`                | Changes resolved metadata before rendering and asset caching.       |
| `openInNewTab`             | `true`                     | Adds `target="_blank"` and `rel="noopener noreferrer"`.             |

## 💾 Image cache

`imageCache: true` writes thumbnails and favicons to
`public/satteri-link-card/` and renders them from `/satteri-link-card/`.

Use the built-in store to change the filesystem location:

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

Custom backends can implement the exported `ImageCacheStore` interface. The
initial cache supports common raster formats and ICO favicons. SVG assets are
not cached. Image-cache failures fall back to the remote asset URL.

## 🔒 Security and limitations

Metadata and image requests run in the build environment. Use the plugin only
with trusted Markdown. Requests to private or local network addresses are not
currently blocked.

The plugin does not provide offline builds, cache pruning, or concurrency limits
across different URLs.

## 🔁 Relationship to `remark-link-card-plus`

This package is inspired by
[`remark-link-card-plus`](https://github.com/okaryo/remark-link-card-plus), but
the packages are not interchangeable:

- `remark-link-card-plus` is a Remark/mdast plugin; this package is a Sätteri
  HAST plugin.
- Option names and configuration structures differ.
- Metadata caching and image caching are separate in this package.

## 🛠️ Development

```sh
vp install
vp check
vp test
vp pack
```

## 📄 License

[MIT](./LICENSE)
