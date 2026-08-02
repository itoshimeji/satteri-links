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

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT = 5000;

function resolveOptions(options: SatteriLinkCardOptions): ResolvedSatteriLinkCardOptions {
  return {
    cache: options.cache ?? {},
    fetch: options.fetch ?? globalThis.fetch,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    openInNewTab: options.openInNewTab ?? true,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
  };
}

export function satteriLinkCard(options: SatteriLinkCardOptions = {}) {
  const resolvedOptions = resolveOptions(options);
  const cache =
    resolvedOptions.cache === false ? undefined : new MetadataCache(resolvedOptions.cache);
  const inflight = new Map<string, Promise<LinkMetadata | undefined>>();

  async function resolveMetadata(url: URL): Promise<LinkMetadata | undefined> {
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
        const metadata = await fetchMetadata(url, resolvedOptions);
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
  }

  return defineHastPlugin({
    name: "satteri-link-card",
    element: {
      filter: ["p"],
      async visit(node, context) {
        const url = findBareUrl(node, context);
        if (!url) {
          return;
        }

        const metadata = await resolveMetadata(url);
        if (metadata) {
          return renderLinkCard(metadata, resolvedOptions.openInNewTab);
        }
      },
    },
  });
}
