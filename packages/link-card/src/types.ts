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

export type ThumbnailOptions = {
  position?: "left" | "right";
};

export type MetadataTransformer = (
  metadata: Readonly<LinkMetadata>,
  url: URL,
) => LinkMetadata | Promise<LinkMetadata>;

export type ImageCacheOptions = {
  store?: ImageCacheStore;
  maxImageBytes?: number;
};

export type SatteriLinkCardOptions = {
  metadataCache?: MetadataCacheOptions | false;
  shortenUrl?: boolean;
  thumbnail?: false | ThumbnailOptions;
  favicon?: false;
  ignoreExtensions?: string[];
  transformMetadata?: MetadataTransformer;
  imageCache?: boolean | ImageCacheOptions;
  openInNewTab?: boolean;
};

export type ResolvedSatteriLinkCardOptions = {
  metadataCache: false | FileSystemMetadataCacheOptions;
  shortenUrl: boolean;
  thumbnail: false | ThumbnailOptions;
  favicon: boolean;
  ignoreExtensions: string[];
  transformMetadata?: MetadataTransformer;
  imageCache: false | { store: ImageCacheStore; maxImageBytes?: number };
  openInNewTab: boolean;
};
