# Satteri Links

Link-related plugins for [Sätteri](https://github.com/bruits/satteri), developed
and released from one monorepo.

> [!WARNING]
> This project is experimental. APIs, generated HTML, CSS class names, and
> behavior may change incompatibly between releases.

[View live examples](https://satteri-links.hamazaki.me/).

## 📦 Packages

- 🌌 [`satteri-link-card`](./packages/link-card) turns a standalone URL into a
  metadata-rich link card.
- 💬 [`satteri-link-mention`](./packages/link-mention) turns an empty Markdown
  link into an inline mention.
- 🔎 [`@itoshinji/link-preview`](./packages/link-preview) resolves link metadata
  and images without depending on Sätteri or Markdown.

Install a feature package if you use Sätteri. Use `@itoshinji/link-preview`
directly when building another integration.

## 👨‍🚀 Astro

The feature packages can be used in Astro through `@astrojs/markdown-satteri`.
Each package README includes the complete Astro configuration and styling
instructions.

## 📄 License

[MIT](./LICENSE)
