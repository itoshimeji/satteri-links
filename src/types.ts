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
  openInNewTab: boolean;
};
