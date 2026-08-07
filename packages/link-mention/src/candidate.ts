import type { HastNode, HastVisitorContext } from "satteri";

type HastElement = Extract<HastNode, { type: "element" }>;

export function findEmptyUrl(
  link: Readonly<HastElement>,
  context: HastVisitorContext,
): URL | undefined {
  if (link.children.length !== 0) {
    return undefined;
  }

  const href = link.properties.href;
  // Only an explicitly empty Markdown link (`[](https://example.com)`) is a
  // mention placeholder. Labeled links keep their authored content.
  if (typeof href !== "string" || context.textContent(link) !== "") {
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
