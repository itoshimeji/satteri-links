# 🔎 @itoshinji/link-preview

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
- Applies request concurrency limits, timeouts, and bounded HTML metadata scans
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
The metadata resolver reads the HTML head first and stops at its end if it found a title.
If the head has no title, it scans the body within the same byte budget.
`maxHtmlBytes` defaults to 1 MiB and limits bytes inspected, not the size
declared by `Content-Length`; `timeoutMs` defaults to 5 seconds.

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

## 🚦 Request concurrency

`createMetadataResolver` and `createImageResolver` each create an independent
queue, with defaults of **64 active HTTP requests in total** and **4 per host**.
Set `maxConcurrentRequests` and `maxConcurrentRequestsPerHost` to positive safe
integers to change them; invalid limits throw `RangeError` at factory creation.

To share one budget between metadata, images and favicons, use the optional
combined factory:

```ts
import {
  createFileSystemImageCacheStore,
  createLinkPreviewResolvers,
} from "@itoshinji/link-preview";

const { resolveMetadata, resolveImage } = createLinkPreviewResolvers({
  maxConcurrentRequests: 64,
  maxConcurrentRequestsPerHost: 4,
  cache: { directory: ".cache/link-preview" },
  image: {
    store: createFileSystemImageCacheStore({
      directory: "public/link-preview",
      publicPath: "/link-preview",
    }),
  },
});
```

The combined factory accepts the metadata resolver options and an optional
`image` configuration (`store`, `maxBytes`, `timeoutMs`). Its top-level `fetch`
is used for both resolvers. Without `image`, `resolveImage` is `undefined`.
The card and mention plugins use this factory internally; callers only need
to set the limits on their plugin options.

Cache lookup and in-flight URL deduplication happen before queuing. Queue time
is excluded from the fetch timeout. Slots are held through required body reads
or cancellation, and released after errors. A saturated host is skipped so
other hosts can use spare total capacity. Cache storage writes do not hold a
network slot.

A host is the initial URL's normalized `hostname`, regardless of scheme or
port. Subdomains have separate budgets. Redirects retain the initial hostname's
slot; the per-host limit does not guarantee a limit on the redirect destination
hostname, and fetch redirect behavior is unchanged. Custom fetch implementations use
the queue, but extra requests they initiate internally are not tracked.

Reuse the same resolvers across documents to share their queue. Separate
factory calls and processes are independent. These limits control simultaneous
requests, not request frequency or requests per second.

## ⚙️ Public API

- `createMetadataResolver(options?)`
- `createImageResolver(options)`
- `createLinkPreviewResolvers(options?)`
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
