import { type DefaultTreeAdapterTypes, parse } from "parse5";
import type { LinkMetadata } from "./types.js";

export type MetadataFetchOptions = {
  fetch: typeof globalThis.fetch;
  maxBytes: number;
  timeoutMs: number;
};

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type ExtractedMetadata = Omit<LinkMetadata, "url">;

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function getAttribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function getFaviconPriority(element: HtmlElement): number | undefined {
  const rel = getAttribute(element, "rel")?.toLowerCase().split(/\s+/).filter(Boolean);

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

function collectText(node: HtmlNode): string {
  if ("value" in node) {
    return node.value;
  }

  if (!("childNodes" in node)) {
    return "";
  }

  return node.childNodes.map(collectText).join("");
}

function walk(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  // Metadata should normally live in <head>, but real pages sometimes place it
  // elsewhere or contain malformed markup. The response-size limit bounds this
  // full-tree traversal, and parse5 has already built the complete tree.
  visit(node);
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      walk(child, visit);
    }
  }
}

function first(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function resolveHttpUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    // Open Graph image values may be absolute, root-relative, or relative to
    // the fetched document. URL resolves all three forms without string joins.
    const url = new URL(value, base);
    // Link previews deliberately reject data:, file:, and other non-web schemes.
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // Invalid metadata is ignored in favor of a card without an image.
  }

  return undefined;
}

export function extractMetadata(html: string, documentUrl: URL): ExtractedMetadata {
  // Use an HTML parser instead of regular expressions because metadata pages
  // often contain irregular markup, entity references, or reordered attrs.
  const document = parse(html);
  const metadata = new Map<string, string>();
  let title: string | undefined;
  let faviconCandidate: { priority: number; value: string } | undefined;

  walk(document, (node) => {
    if (!isElement(node)) {
      return;
    }

    if (node.tagName === "title" && !title) {
      title = collectText(node).trim();
      return;
    }

    if (node.tagName === "link") {
      const priority = getFaviconPriority(node);
      const href = getAttribute(node, "href")?.trim();
      if (priority !== undefined && href) {
        if (!faviconCandidate || priority < faviconCandidate.priority) {
          faviconCandidate = { priority, value: href };
        }
      }
      return;
    }

    if (node.tagName !== "meta") {
      return;
    }

    // Open Graph conventionally uses `property`, while standard metadata and
    // Twitter Cards commonly use `name`. Supporting both also tolerates pages
    // that use a non-standard attribute for a known metadata key.
    const key = first(
      getAttribute(node, "property")?.toLowerCase(),
      getAttribute(node, "name")?.toLowerCase(),
    );
    const content = getAttribute(node, "content")?.trim();
    // Keep the first declaration. This makes duplicate or malformed metadata
    // deterministic and matches the order in which the document presents it.
    if (key && content && !metadata.has(key)) {
      metadata.set(key, content);
    }
  });

  return {
    // Prefer metadata intended for rich previews, then progressively fall back
    // to more general document metadata so incomplete pages still form a card.
    title:
      first(metadata.get("og:title"), metadata.get("twitter:title"), title) ?? documentUrl.hostname,
    siteName: first(metadata.get("og:site_name"), metadata.get("application-name")),
    description: first(
      metadata.get("og:description"),
      metadata.get("twitter:description"),
      metadata.get("description"),
    ),
    image: resolveHttpUrl(
      first(metadata.get("og:image"), metadata.get("og:image:url"), metadata.get("twitter:image")),
      documentUrl,
    ),
    favicon:
      resolveHttpUrl(faviconCandidate?.value, documentUrl) ??
      resolveHttpUrl("/favicon.ico", documentUrl),
  };
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  // response.text() would buffer the entire body before its size could be
  // checked. Reading chunks lets the build stop downloading and buffering as
  // soon as an unexpectedly large page crosses the configured limit.
  // Content-Length is an inexpensive early check, but it is optional and can
  // be absent. The streaming check below protects responses with no length.
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Link preview response is too large");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let html = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      // Cancel as soon as the limit is crossed instead of buffering the rest
      // of a response that can never produce a card.
      await reader.cancel();
      throw new Error("Link preview response is too large");
    }

    // A UTF-8 character may be split across response chunks. Streaming decode
    // preserves an incomplete byte sequence until the next chunk arrives.
    html += decoder.decode(value, { stream: true });
  }

  // Signal end-of-input so TextDecoder flushes any bytes retained by streaming
  // mode. This is usually an empty string when the last chunk ended cleanly.
  return html + decoder.decode();
}

export async function fetchMetadata(
  url: URL,
  options: MetadataFetchOptions,
): Promise<LinkMetadata> {
  // The caller owns the fetch implementation so it can add access control,
  // proxying, retries, or SSRF protection while this plugin still enforces a
  // timeout and HTML/size constraints around the request.
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

    const html = await readResponseText(response, options.maxBytes);
    const responseUrl = response.url ? new URL(response.url) : url;
    // These URLs intentionally serve different roles. The final response URL
    // is only parsing context for relative assets and hostname fallbacks; the
    // original Markdown URL remains the card destination.
    return { url: url.href, ...extractMetadata(html, responseUrl) };
  } finally {
    clearTimeout(timeout);
  }
}
