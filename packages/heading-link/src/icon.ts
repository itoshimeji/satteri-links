import type { Element, ElementContent } from "hast";
import type { HeadingLinkIcon } from "./types.js";

/*
 * The default icon follows Starlight's `link-alt` icon. The surrounding
 * element is marked aria-hidden by the renderer, so the icon never becomes
 * the accessible name of the link.
 *
 * Reference: @astrojs/starlight commit
 * 656ffd54e5b27483f542c9eb8b12fd32f44372ae.
 */
const DEFAULT_PATH =
  "m12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 1 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 1 0-1.42-1.42m8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 1 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 0 0 0 1.42 1 1 0 0 0 1.42 0l3.89-3.89a4.49 4.49 0 0 0 0-6.33M8.83 15.17a1 1 0 0 0 .71.29 1 1 0 0 0 .71-.29l4.92-4.92a1 1 0 1 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42";

export const defaultHeadingLinkIcon: Element = {
  type: "element",
  tagName: "svg",
  properties: {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    focusable: "false",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: { d: DEFAULT_PATH },
      children: [],
    },
  ],
};

export function iconContent(value: HeadingLinkIcon): ElementContent[] {
  if (typeof value === "string") {
    return [{ type: "text", value }];
  }

  return Array.isArray(value)
    ? [...(value as readonly ElementContent[])]
    : [value as ElementContent];
}
