export type LinkMetadata = {
  url: string;
  title: string;
  siteName?: string;
  description?: string;
  image?: string;
  favicon?: string;
};

export type FileSystemMetadataCacheOptions = {
  directory: string;
  maxAge?: number | false;
};

export type CreateMetadataResolverOptions = {
  cache?: false | FileSystemMetadataCacheOptions;
  fetch?: typeof globalThis.fetch;
  /** Maximum number of HTML response bytes inspected for metadata. */
  maxHtmlBytes?: number;
  /** Deadline for fetching and scanning metadata, in milliseconds. */
  timeoutMs?: number;
};

export type ImageInput = {
  bytes: Uint8Array;
  contentType: string;
};

export type CachedImage = {
  src: string;
};

export interface ImageCacheStore {
  get(sourceUrl: URL): Promise<CachedImage | undefined>;
  put(sourceUrl: URL, image: ImageInput): Promise<CachedImage>;
}

export type CreateImageResolverOptions = {
  store: ImageCacheStore;
  fetch?: typeof globalThis.fetch;
  maxBytes?: number;
  timeoutMs?: number;
};

export type FileSystemImageCacheStoreOptions = {
  directory: string;
  publicPath: string;
};
