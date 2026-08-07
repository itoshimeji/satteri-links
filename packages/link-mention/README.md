# satteri-link-mention

A Sätteri HAST plugin that turns an empty Markdown link into an inline mention
at build time.

> [!WARNING]
> This package is experimental. Its API, generated HTML, CSS class names, and
> behavior may change incompatibly between releases.

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

## 🌌 Astro setup

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

| Option                     | Default                       | Description                                                       |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `mention.favicon`          | `true`                        | Shows the resolved favicon when available.                        |
| `mention.siteName`         | `true`                        | Shows `og:site_name` or `application-name` when available.        |
| `mention.title`            | `true`                        | Shows the resolved page title.                                    |
| `mention.order`            | favicon, siteName, title      | Sets the order of enabled parts. Duplicate values throw an error. |
| `metadataCache`            | `{}`                          | Metadata cache settings, or `false` to disable the cache.         |
| `metadataCache.directory`  | `.cache/satteri-link-mention` | Directory for cached metadata files.                              |
| `metadataCache.maxAge`     | 30 days                       | Maximum age in milliseconds, or `false` to never expire.          |
| `imageCache`               | `false`                       | Caches favicons locally when configured.                          |
| `imageCache.maxImageBytes` | 5 MiB                         | Maximum download size for one cached favicon.                     |
| `openInNewTab`             | `true`                        | Adds `target="_blank"` and `rel="noopener noreferrer"`.           |

Use `createFileSystemImageCacheStore` from this package to configure a custom
location for cached favicon assets.

## 🔒 Security and limitations

Metadata and image requests run in the build environment. Use the plugin only
with trusted Markdown. Requests to private or local network addresses are not
currently blocked.

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
