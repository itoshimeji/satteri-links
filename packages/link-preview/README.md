# @itoshinji/link-preview

Framework-independent, build-time metadata and image resolution for link
previews.

> [!WARNING]
> This package is experimental. Its API, returned metadata, cache interfaces,
> and behavior may change incompatibly between releases.

The package does not depend on Sätteri or a Markdown AST. Use it directly when
building another integration. `satteri-link-card` and `satteri-link-mention`
use it internally.

## ✨ Features

- Resolves titles, site names, descriptions, Open Graph images, and favicons
- Applies request timeouts and response-size limits
- Supports filesystem metadata and image caches
- Accepts custom `fetch` implementations and image-cache stores
- Returns predictable fallbacks when metadata or image requests fail

## 📦 Installation

```sh
pnpm add @itoshinji/link-preview
```

Node.js 22 or newer is required.

## 🚀 Metadata example

```ts
import { createMetadataResolver } from "@itoshinji/link-preview";

const resolveMetadata = createMetadataResolver({
  cache: {
    directory: ".cache/link-preview",
  },
});

const metadata = await resolveMetadata(new URL("https://example.com/article"));
```

Metadata failures return `undefined` instead of throwing a request error.

## 🖼️ Image example

```ts
import { createFileSystemImageCacheStore, createImageResolver } from "@itoshinji/link-preview";

const resolveImage = createImageResolver({
  store: createFileSystemImageCacheStore({
    directory: "public/link-preview",
    publicPath: "/link-preview",
  }),
});

const imagePath = await resolveImage("https://example.com/image.png");
```

Image-cache failures return the original remote URL.

## ⚙️ Public API

- `createMetadataResolver(options?)`
- `createImageResolver(options)`
- `createFileSystemImageCacheStore(options)`
- Resolver, metadata, image, and cache-store types used by those factories

Network limits belong to the resolver factories. Filesystem locations,
rendering, and feature policy belong to the calling application or plugin.

## 🔒 Security and limitations

Callers are responsible for deciding which URLs may be fetched. Provide a
restricted `fetch` implementation when processing untrusted URLs. The default
resolver does not block private or local network addresses.

The package resolves metadata and assets only. It does not generate link-card
or mention HTML and does not provide CSS.

## 🛠️ Development

```sh
vp install
vp check
vp test
vp pack
```

## 📄 License

[MIT](./LICENSE)
