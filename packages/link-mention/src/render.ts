import type { HastNode } from "satteri";
import type { LinkMetadata, MentionOptions, MentionPart } from "./types.js";

type HastElement = Extract<HastNode, { type: "element" }>;
type HastText = Extract<HastNode, { type: "text" }>;

function text(value: string): HastText {
  return { type: "text", value };
}

function element(
  tagName: string,
  properties: HastElement["properties"],
  children: HastElement["children"],
): HastElement {
  return { children, properties, tagName, type: "element" };
}

function createLinkElement(metadata: LinkMetadata, part: MentionPart): HastElement | undefined {
  switch (part) {
    case "favicon":
      return metadata.favicon ? createFavicon(metadata.favicon) : undefined;
    case "siteName":
      return metadata.siteName ? createSiteName(metadata.siteName) : undefined;
    case "title":
      return createTitle(metadata.title);
  }
}

function createFavicon(src: string): HastElement {
  return element(
    "img",
    {
      alt: "",
      className: ["satteri-link-mention__favicon"],
      decoding: "async",
      src,
    },
    [],
  );
}

function createSiteName(siteName: string): HastElement {
  return element(
    "span",
    {
      className: ["satteri-link-mention__site-name"],
    },
    [text(siteName)],
  );
}

function createTitle(title: string): HastElement {
  return element(
    "span",
    {
      className: ["satteri-link-mention__title"],
    },
    [text(title)],
  );
}

function placeParts(metadata: LinkMetadata, mention: Required<MentionOptions>): HastElement[] {
  const used = new Set<string>();

  return mention.order.flatMap((part) => {
    if (used.has(part)) {
      throw new Error("there are duplicate elements in the mention.order field");
    }
    used.add(part);

    if (!mention[part]) {
      return [];
    }

    const element = createLinkElement(metadata, part);
    return element ? [element] : [];
  });
}

type renderLinkMentionOptions = {
  mention: Required<MentionOptions>;
  openInNewTab: boolean;
};

export function renderLinkMention(
  metadata: LinkMetadata,
  options: renderLinkMentionOptions,
): HastElement {
  const children = placeParts(metadata, options.mention);

  const mention = element(
    "a",
    {
      className: ["satteri-link-mention"],
      href: metadata.url,
      ...(options.openInNewTab ? { rel: ["noopener", "noreferrer"], target: "_blank" } : {}),
    },
    [...children],
  );

  return mention;
}
