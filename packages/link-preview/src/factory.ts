import { MetadataCache } from "./cache.js";
import { FetchQueue } from "./concurrency.js";
import { fetchImage } from "./image-fetch.js";
import { fetchMetadata } from "./metadata.js";
import type {
  CreateImageResolverOptions,
  CreateLinkPreviewResolversOptions,
  CreateMetadataResolverOptions,
  LinkMetadata,
} from "./types.js";

const DEFAULT_MAX_HTML_BYTES = 1024 * 1024;
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

export type MetadataResolver = (url: URL) => Promise<LinkMetadata | undefined>;

export function createMetadataResolver(
  options: CreateMetadataResolverOptions = {},
): MetadataResolver {
  return metadataResolver(options, new FetchQueue(options));
}

function metadataResolver(
  options: CreateMetadataResolverOptions,
  queue: FetchQueue,
): MetadataResolver {
  const fetch = options.fetch ?? globalThis.fetch;
  const maxHtmlBytes = options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cache = !options.cache ? undefined : new MetadataCache(options.cache);
  const inflight = new Map<string, Promise<LinkMetadata | undefined>>();

  return async (url) => {
    const key = url.href;
    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      const cached = await cache?.get(key);
      if (cached) {
        return cached;
      }

      try {
        const metadata = await queue.run(url, () =>
          fetchMetadata(url, { fetch, maxBytes: maxHtmlBytes, timeoutMs }),
        );
        await cache?.set(key, metadata).catch(() => undefined);
        return metadata;
      } catch {
        return undefined;
      }
    })();

    inflight.set(key, request);
    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  };
}

export type ImageResolver = (source: string) => Promise<string | undefined>;

export function createImageResolver(options: CreateImageResolverOptions): ImageResolver {
  return imageResolver(options, new FetchQueue(options));
}

function imageResolver(options: CreateImageResolverOptions, queue: FetchQueue): ImageResolver {
  const fetch = options.fetch ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const inflight = new Map<string, Promise<string | undefined>>();

  return async (source) => {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(source);
      if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
        return undefined;
      }
    } catch {
      return undefined;
    }

    const key = sourceUrl.href;
    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      try {
        const cached = await options.store.get(sourceUrl);
        if (cached) {
          return cached.src;
        }

        const image = await queue.run(sourceUrl, () =>
          fetchImage(sourceUrl, { fetch, maxBytes, timeoutMs }),
        );
        return (await options.store.put(sourceUrl, image)).src;
      } catch {
        return sourceUrl.href;
      }
    })();

    inflight.set(key, request);
    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  };
}

/** Creates metadata and optional image resolvers with a shared request budget. */
export function createLinkPreviewResolvers(options: CreateLinkPreviewResolversOptions = {}): {
  resolveMetadata: MetadataResolver;
  resolveImage: ImageResolver | undefined;
} {
  const queue = new FetchQueue(options);
  return {
    resolveMetadata: metadataResolver(options, queue),
    resolveImage: options.image
      ? imageResolver({ ...options.image, fetch: options.fetch }, queue)
      : undefined,
  };
}
