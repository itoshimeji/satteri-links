export type LinkMetadata = {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
};

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

export type ImageCacheOptions = {
  store?: ImageCacheStore;
  maxBytes?: number;
};

export type SatteriLinkCardOptions = {
  metadataCache?: MetadataCacheOptions | false;
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
  timeout?: number;
  shortenUrl?: boolean;
  thumbnail?: false | ThumbnailOptions;
  favicon?: false;
  ignoreExtensions?: string[];
  transformMetadata?: MetadataTransformer;
  imageCache?: boolean | ImageCacheOptions;
  openInNewTab?: boolean;
};

export type ResolvedSatteriLinkCardOptions = {
  metadataCache: MetadataCacheOptions | false;
  fetch: typeof globalThis.fetch;
  maxResponseBytes: number;
  timeout: number;
  shortenUrl: boolean;
  thumbnail: false | ThumbnailOptions;
  favicon: boolean;
  ignoreExtensions: string[];
  transformMetadata?: MetadataTransformer;
  imageCache: false | Required<ImageCacheOptions>;
  openInNewTab: boolean;
};
