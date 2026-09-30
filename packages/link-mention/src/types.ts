import type {
  FileSystemMetadataCacheOptions,
  FetchConcurrencyOptions,
  ImageCacheStore,
  LinkMetadata,
} from "@itoshinji/link-preview";

export type { LinkMetadata };

export type MetadataCacheOptions = {
  directory?: string;
  maxAge?: number | false;
};

export type ImageCacheOptions = {
  store?: ImageCacheStore;
  maxImageBytes?: number;
};

export type MentionPart = "favicon" | "siteName" | "title";

export type MentionOptions = {
  favicon?: boolean;
  siteName?: boolean;
  title?: boolean;
  order?: MentionPart[];
};

export type SatteriLinkMentionOptions = FetchConcurrencyOptions & {
  /** Fetch implementation for metadata and image-cache downloads. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  metadataCache?: MetadataCacheOptions | false;
  imageCache?: boolean | ImageCacheOptions;
  mention?: MentionOptions;
  openInNewTab?: boolean;
};

export type ResolvedSatteriLinkMentionOptions = {
  metadataCache: false | FileSystemMetadataCacheOptions;
  imageCache: false | { store: ImageCacheStore; maxImageBytes?: number };
  mention: Required<MentionOptions>;
  openInNewTab: boolean;
};
