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

export type FetchConcurrencyOptions = {
  /** Maximum active HTTP requests, including response body reads. Defaults to 64. */
  maxConcurrentRequests?: number;
  /** Maximum active requests per initial URL hostname, regardless of port or scheme. Defaults to 4. */
  maxConcurrentRequestsPerHost?: number;
};

export type CreateMetadataResolverOptions = FetchConcurrencyOptions & {
  cache?: false | FileSystemMetadataCacheOptions;
  fetch?: typeof globalThis.fetch;
  /** Maximum number of HTML response bytes inspected for metadata. */
  maxHtmlBytes?: number;
  /** Deadline for fetching and scanning metadata, excluding queue time, in milliseconds. */
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

export type CreateImageResolverOptions = FetchConcurrencyOptions & {
  store: ImageCacheStore;
  fetch?: typeof globalThis.fetch;
  maxBytes?: number;
  /** Deadline for fetching and reading an image, excluding queue time, in milliseconds. */
  timeoutMs?: number;
};

export type CreateLinkPreviewResolversOptions = CreateMetadataResolverOptions & {
  /** Enables image resolution using the same fetch implementation and queue as metadata. */
  image?: Omit<CreateImageResolverOptions, keyof FetchConcurrencyOptions | "fetch">;
};

export type FileSystemImageCacheStoreOptions = {
  directory: string;
  publicPath: string;
};
