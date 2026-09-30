# 💬 satteri-link-mention

A Sätteri HAST plugin that turns an empty Markdown link into an inline mention
at build time.

> [!WARNING]
> This package is experimental. Its API, generated HTML, CSS class names, and
> behavior may change incompatibly between releases.

[View live examples](https://satteri-links.hamazaki.me/link-mention/).

## ✨ Features

- Uses an empty Markdown link as an explicit mention placeholder
- Displays the favicon, site name, and title when available
- Allows each part to be hidden or reordered
- Caches metadata locally by default
- Optionally caches favicons as public assets
- Provides optional preset CSS without injecting styles

## 📦 Installation

```sh
pnpm add satteri-link-mention satteri
```

Node.js 22 or newer is required.

## 🚀 Sätteri setup

```ts
import { markdownToHtml } from "satteri";
import { satteriLinkMention } from "satteri-link-mention";

const result = await markdownToHtml("See [](https://example.com/article) for details.", {
  hastPlugins: [satteriLinkMention()],
});
```

Only an empty HTTP or HTTPS Markdown link is converted. Bare URLs and links with
authored text stay unchanged.

## 👨‍🚀 Astro setup

Install the Astro processor and configure it in `astro.config.mjs`:

```sh
pnpm add @astrojs/markdown-satteri satteri satteri-link-mention
```

```js
import { satteri } from "@astrojs/markdown-satteri";
import { defineConfig } from "astro/config";
import { satteriLinkMention } from "satteri-link-mention";

export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [satteriLinkMention()],
    }),
  },
});
```

## 🎨 Styling

The plugin emits class names but does not inject CSS. Import the optional preset
once from a shared Astro layout or another global stylesheet entry:

```astro
---
import "satteri-link-mention/preset.css";
---
```

You can omit the preset and define the styles yourself. The generated elements
use these stable classes for the current release:

- `.satteri-link-mention`
- `.satteri-link-mention__favicon`
- `.satteri-link-mention__site-name`
- `.satteri-link-mention__title`

## ⚙️ Options

```ts
satteriLinkMention({
  mention: {
    favicon: true,
    siteName: true,
    title: true,
    order: ["favicon", "siteName", "title"],
  },
  metadataCache: {
    directory: ".cache/satteri-link-mention",
  },
  imageCache: false,
  openInNewTab: true,
});
```

| Option                     | Default                       | Description                                                           |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `mention.favicon`          | `true`                        | Shows the resolved favicon when available.                            |
| `mention.siteName`         | `true`                        | Shows `og:site_name` or `application-name` when available.            |
| `mention.title`            | `true`                        | Shows the resolved page title.                                        |
| `mention.order`            | favicon, siteName, title      | Sets the order of enabled parts. Duplicate values throw an error.     |
| `fetch`                    | `globalThis.fetch`            | Fetch API-compatible function for metadata and image-cache downloads. |
| `metadataCache`            | `{}`                          | Metadata cache settings, or `false` to disable the cache.             |
| `metadataCache.directory`  | `.cache/satteri-link-mention` | Directory for cached metadata files.                                  |
| `metadataCache.maxAge`     | 30 days                       | Maximum age in milliseconds, or `false` to never expire.              |
| `imageCache`               | `false`                       | Enables the filesystem image cache or accepts custom store options.   |
| `imageCache.maxImageBytes` | 5 MiB                         | Maximum download size for one cached favicon.                         |
| `openInNewTab`             | `true`                        | Adds `target="_blank"` and `rel="noopener noreferrer"`.               |

## 🌐 Custom fetch

Pass a Fetch API-compatible function with the same signature as
`globalThis.fetch`:

```ts
const customFetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init);

satteriLinkMention({
  fetch: customFetch,
  imageCache: true,
});
```

This example delegates to the default fetch. The same function handles metadata
requests and, when `imageCache` is enabled, favicon downloads.
Cache hits do not make requests. Without this option, the plugin uses
`globalThis.fetch`.

## 💾 Image cache

`imageCache: true` writes favicons to `public/satteri-link-mention/` and
renders them from `/satteri-link-mention/`.

Use the built-in store to change the filesystem location:

```ts
import { createFileSystemImageCacheStore, satteriLinkMention } from "satteri-link-mention";

satteriLinkMention({
  imageCache: {
    store: createFileSystemImageCacheStore({
      directory: "static/link-mentions",
      publicPath: "/link-mentions",
    }),
  },
});
```

Custom backends can implement the exported `ImageCacheStore` interface.

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

Missing metadata parts are omitted. If metadata cannot be resolved, the empty
link is left unchanged.

## 🛠️ Development

```sh
vp install
vp check
vp test
vp pack
```

## 📄 License

[MIT](./LICENSE)
