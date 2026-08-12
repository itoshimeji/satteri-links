import type { Element, ElementContent } from "hast";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingLinkInfo = {
  readonly id: string;
  readonly text: string;
  readonly level: HeadingLevel;
  readonly heading: Readonly<Element>;
};

export type HeadingLinkIcon = string | ElementContent | readonly ElementContent[];

export type Build<T> = T | ((info: HeadingLinkInfo) => T);

export type MissingIdBehavior = "skip" | "warn" | "error";

export type HeadingLinkPlacement = "end" | "start";

export type SatteriHeadingLinkOptions = {
  /** Heading levels to decorate. Defaults to every HTML heading level. */
  readonly levels?: readonly HeadingLevel[];
  /** Placement mode. The preset styles the default end placement only. */
  readonly placement?: HeadingLinkPlacement;
  /** Use the heading as the link name, or provide a localized accessible name. */
  readonly accessibleName?: "heading" | ((info: HeadingLinkInfo) => string);
  /** Icon content. The default is the built-in link SVG; `false` leaves the icon empty. */
  readonly icon?: false | Build<HeadingLinkIcon>;
  /** How to handle a selected heading that does not already have an ID. */
  readonly missingId?: MissingIdBehavior;
};
