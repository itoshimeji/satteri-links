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

## 👨‍🚀 Astro setup

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

| Option                         | Default                    | Description                                                           |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------- |
| `fetch`                        | `globalThis.fetch`         | Fetch API-compatible function for metadata and image-cache downloads. |
| `maxConcurrentRequests`        | `64`                       | Maximum active HTTP requests per plugin instance.                     |
| `maxConcurrentRequestsPerHost` | `4`                        | Maximum active HTTP requests per initial URL hostname.                |
| `metadataCache`                | `{}`                       | Metadata cache settings, or `false` to disable the cache.             |
| `metadataCache.directory`      | `.cache/satteri-link-card` | Directory for cached metadata files.                                  |
| `metadataCache.maxAge`         | 30 days                    | Maximum age in milliseconds, or `false` to never expire.              |
| `imageCache`                   | `false`                    | Enables the filesystem image cache or accepts custom store options.   |
| `imageCache.maxImageBytes`     | 5 MiB                      | Maximum download size for one cached image.                           |
| `thumbnail`                    | `{ position: "right" }`    | Sets the thumbnail position; use `false` to omit it.                  |
| `favicon`                      | enabled                    | Use `false` to omit favicon discovery and rendering.                  |
| `shortenUrl`                   | `true`                     | Shows only the hostname instead of the full URL.                      |
| `ignoreExtensions`             | `[]`                       | Leaves URLs with matching path extensions unchanged.                  |
| `transformMetadata`            | `undefined`                | Changes resolved metadata before rendering and asset caching.         |
| `openInNewTab`                 | `true`                     | Adds `target="_blank"` and `rel="noopener noreferrer"`.               |

## 🚦 Request concurrency

Each plugin instance limits active HTTP requests to **64 in total** and **4 per
host** by default. Adjust these positive safe integer limits directly:

```ts
satteriLinkCard({
  maxConcurrentRequests: 32,
  maxConcurrentRequestsPerHost: 2,
});
```

Metadata HTML and image-cache downloads (including favicons) share this budget.
Cache hits and duplicate in-flight URLs are resolved before entering the queue.
A request holds its slot until the required body has been read or cancelled;
waiting in the queue does not consume the communication timeout. A saturated
host does not block queued requests to other hosts when total capacity remains.

The same instance shares its budget across all documents that use it. Separate
instances, including card and mention instances, and separate processes have
independent budgets. This controls simultaneous requests, not requests per second
or rate limiting.

A host is the initial request URL's normalized `hostname`: scheme and port are
ignored, so `http://example.com:8080` and `https://EXAMPLE.com` share a host.
Subdomains are separate hosts. Fetch follows redirects as usual; redirected
requests remain charged to the initial hostname, so the per-host limit does not
guarantee a limit on the redirect destination hostname. Custom fetch implementations
use the same queue, but any extra requests they make internally are their own
responsibility.

## 🌐 Custom fetch

Pass a Fetch API-compatible function with the same signature as
`globalThis.fetch`:

```ts
const customFetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init);

satteriLinkCard({
  fetch: customFetch,
  imageCache: true,
});
```

This example delegates to the default fetch. The same function handles metadata
requests and, when `imageCache` is enabled, thumbnail and favicon downloads.
Cache hits do not make requests. Without this option, the plugin uses
`globalThis.fetch`.

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
with trusted Markdown. The default fetch does not block requests to private or
local network addresses. Supplying `fetch` does not itself enable SSRF protection;
URL, redirect, and network access restrictions are the responsibility of your
fetch implementation.

Rejecting a metadata request leaves the original link unchanged. Rejecting an
image-cache request falls back to the remote asset URL, so refusing a download
does not guarantee that external image URLs are removed from the generated HTML.
When `imageCache` is disabled, image URLs are rendered without fetching them in
the build environment.

The plugin does not provide offline builds or cache pruning.

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
