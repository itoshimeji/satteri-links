# satteri-link-mention

An inline Sätteri HAST plugin that replaces an empty Markdown link with a
metadata-rich link mention at build time.

## Install

```sh
npm install satteri-link-mention satteri
```

## Use with Sätteri

```ts
import { markdownToHtml } from "satteri";
import { satteriLinkMention } from "satteri-link-mention";

const result = await markdownToHtml("[](https://example.com/article)", {
  hastPlugins: [satteriLinkMention()],
});
```

Only an empty Markdown link (`[](https://example.com/article)`) is replaced.
Bare URLs and links with authored text stay unchanged. By default, the mention
shows the favicon, Open Graph site name, and title in that order. When a site
name or favicon is unavailable, that part is omitted.

## Styling

The plugin only emits class names. Import the optional preset once from a
global stylesheet entry:

```ts
import "satteri-link-mention/preset.css";
```

Stable classes are `.satteri-link-mention`,
`.satteri-link-mention__favicon`, `.satteri-link-mention__site-name`, and
`.satteri-link-mention__title`.

## Options

```ts
satteriLinkMention({
  mention: {
    favicon: true,
    siteName: true,
    title: true,
    order: ["favicon", "siteName", "title"],
  },
  metadataCache: { directory: ".cache/satteri-link-mention" },
  imageCache: false,
  openInNewTab: true,
});
```

| Option             | Default                  | Description                                                                  |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------- |
| `mention.favicon`  | `true`                   | Renders the discovered favicon when available.                               |
| `mention.siteName` | `true`                   | Renders `og:site_name` or `application-name` when available.                 |
| `mention.title`    | `true`                   | Renders the resolved page title.                                             |
| `mention.order`    | favicon, siteName, title | Sets the order of enabled parts; duplicates throw an error.                  |
| `metadataCache`    | `{}`                     | Stores metadata under `.cache/satteri-link-mention`; use `false` to disable. |
| `imageCache`       | `false`                  | Optionally caches favicons locally; accepts a custom store and byte limit.   |
| `openInNewTab`     | `true`                   | Adds `target="_blank"` with `noopener noreferrer`.                           |

Use `createFileSystemImageCacheStore` from this package to provide a custom
location for cached favicon assets.

## License

[MIT](./LICENSE)
