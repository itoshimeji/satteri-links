import { SAXParser, type EndTag, type StartTag, type Text } from "parse5-sax-parser";
import type { LinkMetadata } from "./types.js";

export type MetadataFetchOptions = {
  fetch: typeof globalThis.fetch;
  maxBytes: number;
  timeoutMs: number;
};

type ExtractedMetadata = Omit<LinkMetadata, "url">;
type Attribute = { name: string; value: string };

const MAX_METADATA_VALUE_CHARS = 8192;
const METADATA_KEYS = new Set([
  "og:title",
  "twitter:title",
  "og:site_name",
  "application-name",
  "og:description",
  "twitter:description",
  "description",
  "og:image",
  "og:image:url",
  "twitter:image",
]);
const HEAD_TAGS = new Set([
  "html",
  "head",
  "base",
  "basefont",
  "bgsound",
  "link",
  "meta",
  "title",
  "noscript",
  "noframes",
  "script",
  "style",
  "template",
]);
const HEAD_TEXT_TAGS = new Set(["title", "noscript", "noframes", "script", "style"]);

function getAttribute(attrs: Attribute[], name: string): string | undefined {
  return attrs.find((attribute) => attribute.name === name)?.value;
}

function getFaviconPriority(attrs: Attribute[]): number | undefined {
  const rel = getAttribute(attrs, "rel")?.toLowerCase().split(/\s+/).filter(Boolean);

  if (!rel) {
    return undefined;
  }

  if (rel.length === 1 && rel[0] === "icon") {
    return 0;
  }

  if (rel.includes("shortcut") && rel.includes("icon")) {
    return 1;
  }

  if (rel.includes("apple-touch-icon")) {
    return 2;
  }

  return undefined;
}

function first(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function resolveHttpUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, base);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // Invalid metadata is ignored in favor of a card without an image.
  }

  return undefined;
}

class MetadataCollector {
  private readonly metadata = new Map<string, string>();
  private title: string | undefined;
  private titleText = "";
  private textTag: string | undefined;
  private templateDepth = 0;
  private phase: "head" | "body" = "head";
  private faviconCandidate: { priority: number; value: string } | undefined;
  done = false;

  private get realTitle(): string | undefined {
    return first(this.metadata.get("og:title"), this.metadata.get("twitter:title"), this.title);
  }

  private endHead(): void {
    if (this.phase === "head") {
      this.phase = "body";
      this.done = !!this.realTitle;
    }
  }

  onStartTag({ tagName, attrs }: StartTag): void {
    // The end tag is optional in HTML. A body tag or body-only element also
    // ends the head; an ambiguous page remains bounded by maxBytes.
    if (this.phase === "head" && this.templateDepth === 0 && !HEAD_TAGS.has(tagName)) {
      this.endHead();
    }
    if (tagName === "body") {
      this.endHead();
    }
    if (this.done) {
      return;
    }

    if (tagName === "template" && this.phase === "head") {
      this.templateDepth += 1;
    }
    if (HEAD_TEXT_TAGS.has(tagName)) {
      this.textTag = tagName;
      if (tagName === "title") {
        this.titleText = "";
      }
    }

    if (tagName === "link") {
      const priority = getFaviconPriority(attrs);
      const href = getAttribute(attrs, "href")?.trim();
      if (
        priority !== undefined &&
        href &&
        href.length <= MAX_METADATA_VALUE_CHARS &&
        (!this.faviconCandidate || priority < this.faviconCandidate.priority)
      ) {
        this.faviconCandidate = { priority, value: href };
      }
    } else if (tagName === "meta") {
      const key = first(
        getAttribute(attrs, "property")?.toLowerCase(),
        getAttribute(attrs, "name")?.toLowerCase(),
      );
      const content = getAttribute(attrs, "content")?.trim();
      if (
        key &&
        METADATA_KEYS.has(key) &&
        content &&
        content.length <= MAX_METADATA_VALUE_CHARS &&
        !this.metadata.has(key)
      ) {
        this.metadata.set(key, content);
      }
    }

    if (this.phase === "body" && this.realTitle) {
      this.done = true;
    }
  }

  onEndTag({ tagName }: EndTag): void {
    if (tagName === "title" && this.textTag === "title") {
      this.title ||= this.titleText.trim();
    }
    if (tagName === this.textTag) {
      this.textTag = undefined;
    }
    if (tagName === "template" && this.templateDepth > 0) {
      this.templateDepth -= 1;
    }
    if (tagName === "head") {
      this.endHead();
    }
    if (this.phase === "body" && this.realTitle) {
      this.done = true;
    }
  }

  onText({ text }: Text): void {
    if (this.textTag === "title") {
      this.titleText += text.slice(0, MAX_METADATA_VALUE_CHARS - this.titleText.length);
    } else if (this.phase === "head" && this.templateDepth === 0 && !this.textTag && text.trim()) {
      this.endHead();
    }
  }

  finish(documentUrl: URL): ExtractedMetadata {
    // A scan limit can be reached in the middle of an unclosed title element.
    const title = first(this.title, this.textTag === "title" ? this.titleText : undefined);
    return {
      title:
        first(this.metadata.get("og:title"), this.metadata.get("twitter:title"), title) ??
        documentUrl.hostname,
      siteName: first(this.metadata.get("og:site_name"), this.metadata.get("application-name")),
      description: first(
        this.metadata.get("og:description"),
        this.metadata.get("twitter:description"),
        this.metadata.get("description"),
      ),
      image: resolveHttpUrl(
        first(
          this.metadata.get("og:image"),
          this.metadata.get("og:image:url"),
          this.metadata.get("twitter:image"),
        ),
        documentUrl,
      ),
      favicon:
        resolveHttpUrl(this.faviconCandidate?.value, documentUrl) ??
        resolveHttpUrl("/favicon.ico", documentUrl),
    };
  }
}

async function writeParser(parser: SAXParser, chunk: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    parser.write(chunk, (error) => (error ? reject(error) : resolve()));
  });
}

async function readMetadata(
  response: Response,
  documentUrl: URL,
  maxBytes: number,
): Promise<ExtractedMetadata> {
  const collector = new MetadataCollector();
  if (!response.body) {
    return collector.finish(documentUrl);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SAXParser();
  parser.on("error", () => undefined);
  const onToken = () => {
    if (collector.done) {
      parser.stop();
    }
  };
  parser.on("startTag", (token: StartTag) => {
    collector.onStartTag(token);
    onToken();
  });
  parser.on("endTag", (token: EndTag) => {
    collector.onEndTag(token);
    onToken();
  });
  parser.on("text", (token: Text) => {
    collector.onText(token);
    onToken();
  });

  let bytesScanned = 0;
  let reachedEof = false;
  try {
    while (!collector.done && bytesScanned < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        break;
      }

      // The limit applies to bytes passed to the parser, not to the declared
      // size of a page whose useful head may be only a few kilobytes long.
      const length = Math.min(value.byteLength, maxBytes - bytesScanned);
      bytesScanned += length;
      const html = decoder.decode(value.subarray(0, length), { stream: true });
      await writeParser(parser, html);
    }

    if (!collector.done) {
      await new Promise<void>((resolve, reject) => {
        parser.once("error", reject);
        parser.end(decoder.decode(), resolve);
      });
    }
    return collector.finish(documentUrl);
  } finally {
    if (!reachedEof) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
    parser.destroy();
  }
}

export async function fetchMetadata(
  url: URL,
  options: MetadataFetchOptions,
): Promise<LinkMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "itoshinji-link-preview",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Link preview request failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType?.includes("text/html") && !contentType?.includes("application/xhtml+xml")) {
      throw new Error("Link preview response is not HTML");
    }

    const responseUrl = response.url ? new URL(response.url) : url;
    return { url: url.href, ...(await readMetadata(response, responseUrl, options.maxBytes)) };
  } finally {
    clearTimeout(timeout);
  }
}
