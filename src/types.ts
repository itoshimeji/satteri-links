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

export type SatteriLinkCardOptions = {
  cache?: LinkCardCacheOptions | false;
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
  openInNewTab?: boolean;
  timeout?: number;
};

export type ResolvedSatteriLinkCardOptions = {
  cache: LinkCardCacheOptions | false;
  fetch: typeof globalThis.fetch;
  maxResponseBytes: number;
  openInNewTab: boolean;
  timeout: number;
};
