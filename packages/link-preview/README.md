# @itoshinji/link-preview

Framework-independent, build-time metadata and image resolution for link
previews. It fetches HTML metadata such as titles, descriptions, Open Graph
images, and favicons, and provides optional filesystem-backed caching.

The package does not depend on Satteri or any Markdown AST implementation.
`satteri-link-card` uses it as a workspace dependency, but other build tools and
content pipelines can use it directly.

## Install

```sh
npm install @itoshinji/link-preview
```

## Example

```ts
import { createMetadataResolver } from "@itoshinji/link-preview";

const resolveMetadata = createMetadataResolver({
  cache: {
    directory: ".cache/link-preview",
  },
});

const metadata = await resolveMetadata(new URL("https://example.com/article"));
```

Resolvers apply request timeouts and response-size limits. Metadata failures
return `undefined`; image-cache failures fall back to the original remote URL.
Callers remain responsible for deciding which URLs may be fetched and for
providing a restricted `fetch` implementation when required.

## Public API

- `createMetadataResolver(options?)`
- `createImageResolver(options)`
- `createFileSystemImageCacheStore(options)`
- Resolver, cache-store, image, and metadata types used by those factories

Network safety defaults belong to the resolver factories. Filesystem locations,
rendering, and feature policy belong to the application or plugin that creates
them.

## License

[MIT](./LICENSE)
