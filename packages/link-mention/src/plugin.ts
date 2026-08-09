import { createImageResolver, createMetadataResolver } from "@itoshinji/link-preview";
import { defineHastPlugin } from "satteri";
import { findEmptyUrl } from "./candidate.js";
import { createFileSystemImageCacheStore } from "./image-store.js";
import { renderLinkMention } from "./render.js";
import type {
  LinkMetadata,
  ResolvedSatteriLinkMentionOptions,
  SatteriLinkMentionOptions,
} from "./types.js";

const DEFAULT_METADATA_CACHE_DIRECTORY = ".cache/satteri-link-mention";

function resolveOptions(options: SatteriLinkMentionOptions): ResolvedSatteriLinkMentionOptions {
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
    imageCache:
      imageCacheOptions === false
        ? false
        : {
            maxImageBytes: imageCacheOptions.maxImageBytes,
            store: imageCacheOptions.store ?? createFileSystemImageCacheStore(),
          },
    mention: {
      favicon: options.mention?.favicon ?? true,
      siteName: options.mention?.siteName ?? true,
      title: options.mention?.title ?? true,
      order: options.mention?.order ?? ["favicon", "siteName", "title"],
    },
    openInNewTab: options.openInNewTab ?? true,
  };
}

export function satteriLinkMention(options: SatteriLinkMentionOptions = {}) {
  const resolvedOptions = resolveOptions(options);
  const resolveMetadata = createMetadataResolver({ cache: resolvedOptions.metadataCache });
  const resolveImage =
    resolvedOptions.imageCache === false
      ? undefined
      : createImageResolver({
          maxBytes: resolvedOptions.imageCache.maxImageBytes,
          store: resolvedOptions.imageCache.store,
        });

  async function resolveFavicon(metadata: LinkMetadata): Promise<LinkMetadata> {
    if (!resolvedOptions.mention.favicon || !metadata.favicon) {
      return { ...metadata, favicon: undefined };
    }

    const favicon = resolveImage ? await resolveImage(metadata.favicon) : metadata.favicon;

    return {
      ...metadata,
      favicon,
    };
  }

  return defineHastPlugin({
    name: "satteri-link-mention",
    element: {
      filter: ["a"],
      async visit(node, context) {
        const url = findEmptyUrl(node, context);
        if (!url) {
          return;
        }

        const metadata = await resolveMetadata(url);
        if (!metadata) {
          return;
        }

        const metadataWithAssets = await resolveFavicon(metadata);
        return renderLinkMention(metadataWithAssets, {
          mention: resolvedOptions.mention,
          openInNewTab: resolvedOptions.openInNewTab,
        });
      },
    },
  });
}
