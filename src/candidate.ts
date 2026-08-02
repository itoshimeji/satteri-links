import type { HastNode, HastVisitorContext } from "satteri";

type HastElement = Extract<HastNode, { type: "element" }>;

function sliceUtf8(source: string, start: number, end: number): string {
  return Buffer.from(source, "utf8").subarray(start, end).toString("utf8");
}

export function findBareUrl(
  paragraph: Readonly<HastElement>,
  context: HastVisitorContext,
): URL | undefined {
  if (context.parent(paragraph)?.type !== "root") {
    return undefined;
  }

  if (paragraph.children.length !== 1) {
    return undefined;
  }

  const link = paragraph.children[0];
  if (link.type !== "element" || link.tagName !== "a") {
    return undefined;
  }

  const href = link.properties.href;
  if (typeof href !== "string" || context.textContent(link) !== href) {
    return undefined;
  }

  const position = paragraph.position;
  if (typeof position?.start.offset !== "number" || typeof position.end.offset !== "number") {
    return undefined;
  }

  const source = sliceUtf8(context.source, position.start.offset, position.end.offset).trim();
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
