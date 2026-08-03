import { defineHastPlugin } from "satteri";
import { MetadataCache } from "./cache.js";
import { findBareUrl } from "./candidate.js";
import { fetchImage } from "./image-fetch.js";
import { createFileSystemImageCacheStore } from "./image-store.js";
import { fetchMetadata } from "./metadata.js";
import { renderLinkCard } from "./render.js";
import type {
  LinkMetadata,
  ResolvedSatteriLinkCardOptions,
  SatteriLinkCardOptions,
} from "./types.js";
import { hasIgnoredExtension } from "./url.js";

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT = 5000;

function resolveOptions(options: SatteriLinkCardOptions): ResolvedSatteriLinkCardOptions {
  const imageCache = options.imageCache ?? false;
  const imageCacheOptions = imageCache === true ? {} : imageCache;

  return {
    metadataCache: options.metadataCache ?? {},
    fetch: options.fetch ?? globalThis.fetch,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    shortenUrl: options.shortenUrl ?? true,
    thumbnail: options.thumbnail ?? { position: "right" },
    favicon: options.favicon !== false,
    ignoreExtensions: options.ignoreExtensions ?? [],
    transformMetadata: options.transformMetadata,
    imageCache:
      imageCacheOptions === false
        ? false
        : {
            maxBytes: imageCacheOptions.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES,
            store: imageCacheOptions.store ?? createFileSystemImageCacheStore(),
          },
    openInNewTab: options.openInNewTab ?? true,
  };
}

export function satteriLinkCard(options: SatteriLinkCardOptions = {}) {
  const resolvedOptions = resolveOptions(options);
  const cache =
    resolvedOptions.metadataCache === false
      ? undefined
      : new MetadataCache(resolvedOptions.metadataCache);
  // This map coalesces simultaneous requests. It is deliberately separate
  // from MetadataCache: in-flight entries live only until the current fetch
  // settles, while the file cache can be reused by later builds.
  const inflight = new Map<string, Promise<LinkMetadata | undefined>>();
  const imageInflight = new Map<string, Promise<string | undefined>>();

  async function resolveMetadata(url: URL): Promise<LinkMetadata | undefined> {
    const key = url.href;
    const pending = inflight.get(key);
    if (pending) {
      // Another paragraph is already resolving this URL; share its result.
      return pending;
    }

    const request = (async () => {
      const cached = await cache?.get(key);
      if (cached) {
        return cached;
      }

      try {
        const metadata = await fetchMetadata(url, resolvedOptions);
        // Cache failures are non-fatal. The freshly fetched metadata can still
        // be rendered even when the filesystem is read-only.
        await cache?.set(key, metadata).catch(() => undefined);
        return metadata;
      } catch {
        // Keep the original link when remote metadata cannot be obtained.
        return undefined;
      }
    })();

    inflight.set(key, request);
    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  }

  async function resolveImage(value: string | undefined): Promise<string | undefined> {
    if (!value) {
      return undefined;
    }

    let sourceUrl: URL;
    try {
      sourceUrl = new URL(value);
      if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
        return undefined;
      }
    } catch {
      return undefined;
    }

    const imageCache = resolvedOptions.imageCache;
    if (imageCache === false) {
      return sourceUrl.href;
    }

    const key = sourceUrl.href;
    const pending = imageInflight.get(key);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      try {
        const cached = await imageCache.store.get(sourceUrl);
        if (cached) {
          return cached.src;
        }

        const image = await fetchImage(sourceUrl, {
          fetch: resolvedOptions.fetch,
          maxBytes: imageCache.maxBytes,
          timeout: resolvedOptions.timeout,
        });
        return (await imageCache.store.put(sourceUrl, image)).src;
      } catch {
        // Image caching is an optimization. Keep the existing remote image if
        // a cache backend or image request is unavailable.
        return sourceUrl.href;
      }
    })();

    imageInflight.set(key, request);
    try {
      return await request;
    } finally {
      imageInflight.delete(key);
    }
  }

  async function resolveAssets(metadata: LinkMetadata): Promise<LinkMetadata> {
    const [image, favicon] = await Promise.all([
      resolvedOptions.thumbnail === false ? undefined : resolveImage(metadata.image),
      resolvedOptions.favicon ? resolveImage(metadata.favicon) : undefined,
    ]);

    return {
      ...metadata,
      image: metadata.image ? image : undefined,
      favicon: metadata.favicon ? favicon : undefined,
    };
  }

  return defineHastPlugin({
    name: "satteri-link-card",
    element: {
      // Filter in Sätteri before entering JavaScript; only paragraph elements
      // can be candidates for a standalone Markdown URL.
      filter: ["p"],
      async visit(node, context) {
        const url = findBareUrl(node, context);
        if (!url || hasIgnoredExtension(url, resolvedOptions.ignoreExtensions)) {
          return;
        }

        const metadata = await resolveMetadata(url);
        if (metadata) {
          let renderMetadata = metadata;
          if (resolvedOptions.transformMetadata) {
            try {
              const transformed = await resolvedOptions.transformMetadata(metadata, url);
              // The Markdown URL is the card destination. Transformers may
              // change preview data, but they cannot redirect the generated
              // card to a different target.
              renderMetadata = { ...transformed, url: metadata.url };
            } catch {
              // A transformer is an enhancement; keep the fetched metadata if
              // user code fails so one card does not break the whole build.
            }
          }

          const metadataWithAssets = await resolveAssets(renderMetadata);

          // Returning a HAST node replaces the original <p> in the output tree.
          return renderLinkCard(metadataWithAssets, {
            shortenUrl: resolvedOptions.shortenUrl,
            thumbnail: resolvedOptions.thumbnail,
            favicon: resolvedOptions.favicon,
            openInNewTab: resolvedOptions.openInNewTab,
          });
        }
      },
    },
  });
}
