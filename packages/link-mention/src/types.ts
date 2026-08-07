import type {
  FileSystemMetadataCacheOptions,
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

export type SatteriLinkMentionOptions = {
  metadataCache?: MetadataCacheOptions | false;
  imageCache?: ImageCacheOptions | false;
  mention?: MentionOptions;
  openInNewTab?: boolean;
};

export type ResolvedSatteriLinkMentionOptions = {
  metadataCache: false | FileSystemMetadataCacheOptions;
  imageCache: false | { store: ImageCacheStore; maxImageBytes?: number };
  mention: Required<MentionOptions>;
  openInNewTab: boolean;
};
