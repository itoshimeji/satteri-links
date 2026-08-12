import type { Element, ElementContent, Properties } from "hast";

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

export type SatteriHeadingLinkOptions = {
  /** Heading levels to decorate. Defaults to every HTML heading level. */
  readonly levels?: readonly HeadingLevel[];
  /** Use the heading as the link name, or provide a localized accessible name. */
  readonly accessibleName?: "heading" | ((info: HeadingLinkInfo) => string);
  /** Icon content. The default is the built-in link SVG; `false` leaves the icon empty. */
  readonly icon?: false | Build<HeadingLinkIcon>;
  /** Additional link properties. Library-owned accessibility and URL properties win. */
  readonly linkProperties?: Build<Properties>;
  /** Additional heading properties. The heading ID remains library-owned. */
  readonly headingProperties?: Build<Properties>;
  /** Additional wrapper properties. The marker and base classes remain library-owned. */
  readonly wrapperProperties?: Build<Properties>;
  /** How to handle a selected heading that does not already have an ID. */
  readonly missingId?: MissingIdBehavior;
};
