export type LinkMetadata = {
  url: string;
  title: string;
  description?: string;
  image?: string;
};

export type LinkCardCacheOptions = {
  directory?: string;
  maxAge?: number | false;
};

// todo: image cache, thumbnail, ignoreExtensions, favicon, ogTransformer
export type SatteriLinkCardOptions = {
  cache?: LinkCardCacheOptions | false;
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
  timeout?: number;
  shortenUrl?: boolean;
  openInNewTab?: boolean;
};

export type ResolvedSatteriLinkCardOptions = {
  cache: LinkCardCacheOptions | false;
  fetch: typeof globalThis.fetch;
  maxResponseBytes: number;
  timeout: number;
  shortenUrl: boolean;
  openInNewTab: boolean;
};
