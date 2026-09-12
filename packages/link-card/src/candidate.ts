import type { HastNode, HastVisitorContext } from "satteri";

type HastElement = Extract<HastNode, { type: "element" }>;

export function findBareUrl(
  paragraph: Readonly<HastElement>,
  context: HastVisitorContext,
): URL | undefined {
  // Only standalone paragraphs at the document root become cards. This keeps
  // links in prose, lists, blockquotes, and other nested content unchanged.
  if (context.parent(paragraph)?.type !== "root") {
    return undefined;
  }

  if (paragraph.children.length !== 1) {
    return undefined;
  }

  const link = paragraph.children[0];
  // Sätteri has already converted a bare Markdown URL into an <a>. Explicit
  // links and paragraphs with extra content are rejected below.
  if (link.type !== "element" || link.tagName !== "a") {
    return undefined;
  }

  const href = link.properties.href;
  // A labeled link such as [Read more](https://example.com) has a different
  // textContent. This check rejects it, but it cannot reject
  // [https://example.com](https://example.com), which is why source matching
  // below is also required.
  if (typeof href !== "string" || context.textContent(link) !== href) {
    return undefined;
  }

  const position = paragraph.position;
  // HAST nodes created by another plugin may not have a source position. In
  // that case we cannot tell how the link was authored, so leave it unchanged.
  if (typeof position?.start.offset !== "number" || typeof position.end.offset !== "number") {
    return undefined;
  }

  // HAST normalizes both a bare URL and an explicit same-label Markdown link
  // to the same <a>. Compare the original Markdown to distinguish them.
  // Sätteri uses UTF-16 code units, matching JavaScript string offsets.
  const source = context.source.slice(position.start.offset, position.end.offset).trim();
  if (source !== href) {
    return undefined;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}
