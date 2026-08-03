import { defineHastPlugin } from "satteri";
import { MetadataCache } from "./cache.js";
import { findBareUrl } from "./candidate.js";
import { fetchMetadata } from "./metadata.js";
import { renderLinkCard } from "./render.js";
import type {
  LinkMetadata,
  ResolvedSatteriLinkCardOptions,
  SatteriLinkCardOptions,
} from "./types.js";
import { hasIgnoredExtension } from "./url.ts";

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT = 5000;

// export type ResolvedSatteriLinkCardOptions = {
//   cache: LinkCardCacheOptions | false;
//   fetch: typeof globalThis.fetch;
//   maxResponseBytes: number;
//   timeout: number;
//   shortenUrl: boolean;
//   thumbnail: false | ThumbnailOptions;
//   ignoreExtensions: string[];
//   openInNewTab: boolean;
// };

function resolveOptions(options: SatteriLinkCardOptions): ResolvedSatteriLinkCardOptions {
  return {
    cache: options.cache ?? {},
    fetch: options.fetch ?? globalThis.fetch,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    shortenUrl: options.shortenUrl ?? true,
    thumbnail: options.thumbnail ?? { position: "right" },
    ignoreExtensions: options.ignoreExtensions ?? [],
    openInNewTab: options.openInNewTab ?? true,
  };
}

export function satteriLinkCard(options: SatteriLinkCardOptions = {}) {
  const resolvedOptions = resolveOptions(options);
  const cache =
    resolvedOptions.cache === false ? undefined : new MetadataCache(resolvedOptions.cache);
  // This map coalesces simultaneous requests. It is deliberately separate
  // from MetadataCache: in-flight entries live only until the current fetch
  // settles, while the file cache can be reused by later builds.
  const inflight = new Map<string, Promise<LinkMetadata | undefined>>();

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
          // Returning a HAST node replaces the original <p> in the output tree.
          return renderLinkCard(metadata, {
            shortenUrl: resolvedOptions.shortenUrl,
            thumbnail: resolvedOptions.thumbnail,
            openInNewTab: resolvedOptions.openInNewTab,
          });
        }
      },
    },
  });
}
