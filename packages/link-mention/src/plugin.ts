import {
  createImageResolver,
  createMetadataResolver,
  createFileSystemImageCacheStore,
} from "@itoshinji/link-preview";
import { defineHastPlugin } from "satteri";
import { findEmptyUrl } from "./candidate.js";
import { renderLinkMention } from "./render.js";
import type {
  LinkMetadata,
  ResolvedSatteriLinkMentionOptions,
  SatteriLinkMentionOptions,
} from "./types.js";

const DEFAULT_METADATA_CACHE_DIRECTORY = ".cache/satteri-link-mention";
const DEFAULT_DIRECTORY = "public/satteri-link-mention";
const DEFAULT_PUBLIC_PATH = "/satteri-link-mention";

function resolveOptions(options: SatteriLinkMentionOptions): ResolvedSatteriLinkMentionOptions {
  const metadataCache = options.metadataCache ?? {};

  return {
    metadataCache:
      metadataCache === false
        ? false
        : {
            directory: metadataCache.directory ?? DEFAULT_METADATA_CACHE_DIRECTORY,
            maxAge: metadataCache.maxAge,
          },
    imageCache: options.imageCache
      ? {
          maxImageBytes: options.imageCache.maxImageBytes,
          store:
            options.imageCache.store ??
            createFileSystemImageCacheStore({
              directory: DEFAULT_DIRECTORY,
              publicPath: DEFAULT_PUBLIC_PATH,
            }),
        }
      : false,
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
