import { createImageResolver, createMetadataResolver } from "@itoshinji/link-preview";
import { defineHastPlugin } from "satteri";
import { findBareUrl } from "./candidate.js";
import { createFileSystemImageCacheStore } from "./image-store.js";
import { renderLinkCard } from "./render.js";
import type {
  LinkMetadata,
  ResolvedSatteriLinkCardOptions,
  SatteriLinkCardOptions,
} from "./types.js";
import { hasIgnoredExtension } from "./url.js";

const DEFAULT_METADATA_CACHE_DIRECTORY = ".cache/satteri-link-card";

function resolveOptions(options: SatteriLinkCardOptions): ResolvedSatteriLinkCardOptions {
  const metadataCache = options.metadataCache ?? {};
  const imageCache = options.imageCache ?? false;
  const imageCacheOptions = imageCache === true ? {} : imageCache;

  return {
    metadataCache:
      metadataCache === false
        ? false
        : {
            directory: metadataCache.directory ?? DEFAULT_METADATA_CACHE_DIRECTORY,
            maxAge: metadataCache.maxAge,
          },
    shortenUrl: options.shortenUrl ?? true,
    thumbnail: options.thumbnail ?? { position: "right" },
    favicon: options.favicon !== false,
    ignoreExtensions: options.ignoreExtensions ?? [],
    transformMetadata: options.transformMetadata,
    imageCache:
      imageCacheOptions === false
        ? false
        : {
            maxImageBytes: imageCacheOptions.maxImageBytes,
            store: imageCacheOptions.store ?? createFileSystemImageCacheStore(),
          },
    openInNewTab: options.openInNewTab ?? true,
  };
}

export function satteriLinkCard(options: SatteriLinkCardOptions = {}) {
  const resolvedOptions = resolveOptions(options);
  const resolveMetadata = createMetadataResolver({ cache: resolvedOptions.metadataCache });
  const resolveImage =
    resolvedOptions.imageCache === false
      ? undefined
      : createImageResolver({
          maxBytes: resolvedOptions.imageCache.maxImageBytes,
          store: resolvedOptions.imageCache.store,
        });

  async function resolveAsset(source: string | undefined): Promise<string | undefined> {
    if (!source || !resolveImage) {
      return source;
    }
    return resolveImage(source);
  }

  async function resolveAssets(metadata: LinkMetadata): Promise<LinkMetadata> {
    const [image, favicon] = await Promise.all([
      resolvedOptions.thumbnail === false ? undefined : resolveAsset(metadata.image),
      resolvedOptions.favicon ? resolveAsset(metadata.favicon) : undefined,
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
      filter: ["p"],
      async visit(node, context) {
        const url = findBareUrl(node, context);
        if (!url || hasIgnoredExtension(url, resolvedOptions.ignoreExtensions)) {
          return;
        }

        const metadata = await resolveMetadata(url);
        if (!metadata) {
          return;
        }

        let renderMetadata = metadata;
        if (resolvedOptions.transformMetadata) {
          try {
            const transformed = await resolvedOptions.transformMetadata(metadata, url);
            renderMetadata = { ...transformed, url: metadata.url };
          } catch {
            // Metadata transformation is optional; retain the fetched value on failure.
          }
        }

        const metadataWithAssets = await resolveAssets(renderMetadata);
        return renderLinkCard(metadataWithAssets, {
          shortenUrl: resolvedOptions.shortenUrl,
          thumbnail: resolvedOptions.thumbnail,
          favicon: resolvedOptions.favicon,
          openInNewTab: resolvedOptions.openInNewTab,
        });
      },
    },
  });
}
