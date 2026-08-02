import { type DefaultTreeAdapterTypes, parse } from "parse5";
import type { LinkMetadata, ResolvedSatteriLinkCardOptions } from "./types.js";

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function getAttribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
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
    const url = new URL(value, base);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // Invalid metadata is ignored in favor of a card without an image.
  }

  return undefined;
}

export function extractMetadata(html: string, url: URL): LinkMetadata {
  const document = parse(html);
  const metadata = new Map<string, string>();
  let title: string | undefined;

  walk(document, (node) => {
    if (!isElement(node)) {
      return;
    }

    if (node.tagName === "title" && !title) {
      title = collectText(node).trim();
      return;
    }

    if (node.tagName !== "meta") {
      return;
    }

    const key = first(
      getAttribute(node, "property")?.toLowerCase(),
      getAttribute(node, "name")?.toLowerCase(),
    );
    const content = getAttribute(node, "content")?.trim();
    if (key && content && !metadata.has(key)) {
      metadata.set(key, content);
    }
  });

  return {
    url: url.href,
    title: first(metadata.get("og:title"), metadata.get("twitter:title"), title) ?? url.hostname,
    description: first(
      metadata.get("og:description"),
      metadata.get("twitter:description"),
      metadata.get("description"),
    ),
    image: resolveHttpUrl(
      first(metadata.get("og:image"), metadata.get("og:image:url"), metadata.get("twitter:image")),
      url,
    ),
  };
}

async function readResponseText(response: Response, maxResponseBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new Error("Link card response is too large");
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
    if (bytesRead > maxResponseBytes) {
      await reader.cancel();
      throw new Error("Link card response is too large");
    }

    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

export async function fetchMetadata(
  url: URL,
  options: ResolvedSatteriLinkCardOptions,
): Promise<LinkMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout);

  try {
    const response = await options.fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "satteri-link-card",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Link card request failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType?.includes("text/html") && !contentType?.includes("application/xhtml+xml")) {
      throw new Error("Link card response is not HTML");
    }

    const html = await readResponseText(response, options.maxResponseBytes);
    const responseUrl = response.url ? new URL(response.url) : url;
    return { ...extractMetadata(html, responseUrl), url: url.href };
  } finally {
    clearTimeout(timeout);
  }
}
