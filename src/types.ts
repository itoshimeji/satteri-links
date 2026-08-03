export type LinkMetadata = {
  url: string;
  title: string;
  description?: string;
  image?: string;
};

export type MetadataCacheOptions = {
  directory?: string;
  maxAge?: number | false;
};

export type ThumbnailOptions = {
  position?: "left" | "right";
};

export type SatteriLinkCardOptions = {
  metadataCache?: MetadataCacheOptions | false;
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
  timeout?: number;
  shortenUrl?: boolean;
  thumbnail?: false | ThumbnailOptions;
  ignoreExtensions?: string[];
  openInNewTab?: boolean;
};

export type ResolvedSatteriLinkCardOptions = {
  metadataCache: MetadataCacheOptions | false;
  fetch: typeof globalThis.fetch;
  maxResponseBytes: number;
  timeout: number;
  shortenUrl: boolean;
  thumbnail: false | ThumbnailOptions;
  ignoreExtensions: string[];
  openInNewTab: boolean;
};
