import type { Element, ElementContent, Properties } from "hast";
import { defaultHeadingLinkIcon, iconContent } from "./icon.js";
import type {
  Build,
  HeadingLinkIcon,
  HeadingLinkInfo,
  SatteriHeadingLinkOptions,
} from "./types.js";

function classList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => classList(item));
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function mergeClassName(base: string[], properties: Properties): Properties {
  const custom = properties.className ?? (properties as Record<string, unknown>).class;
  const result = { ...properties } as Record<string, unknown>;
  delete result.class;
  result.className = [...new Set([...base, ...classList(custom)])];
  return result as Properties;
}

function renderHeadingProperties(heading: Readonly<Element>): Properties {
  const sourceProperties = heading.properties ?? {};
  const sourceClasses = classList(
    sourceProperties.className ?? (sourceProperties as Record<string, unknown>).class,
  );
  const result = mergeClassName(["satteri-heading-link__heading", ...sourceClasses], {
    ...sourceProperties,
  }) as Record<string, unknown>;
  result.id = sourceProperties.id;
  return result as Properties;
}

function renderLinkProperties(
  info: HeadingLinkInfo,
  accessibleName: string | undefined,
): Properties {
  const result: Record<string, unknown> = {};
  result.href = `#${info.id}`;
  if (accessibleName === undefined) result.ariaLabelledby = info.id;
  else result.ariaLabel = accessibleName;
  return mergeClassName(["satteri-heading-link__link"], result as Properties);
}

function renderIcon(
  value: Build<HeadingLinkIcon> | false | undefined,
  info: HeadingLinkInfo,
): Element | undefined {
  if (value === false) return undefined;
  const resolved =
    value === undefined
      ? [defaultHeadingLinkIcon]
      : typeof value === "function"
        ? value(info)
        : value;
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["satteri-heading-link__icon"], ariaHidden: "true" },
    children: iconContent(resolved),
  };
}

export function renderHeadingLink(
  options: SatteriHeadingLinkOptions,
  info: HeadingLinkInfo,
  accessibleName: string | undefined,
): Element {
  const icon = renderIcon(options.icon, info);
  const linkChildren: ElementContent[] = icon ? [icon] : [];
  const placement = options.placement ?? "end";
  const wrapperProps = {
    className: ["satteri-heading-link", `satteri-heading-link--h${info.level}`],
  } as Record<string, unknown>;
  wrapperProps["data-satteri-heading-link"] = true;

  const heading = {
    ...info.heading,
    properties: renderHeadingProperties(info.heading),
  };
  const link = {
    type: "element" as const,
    tagName: "a",
    properties: renderLinkProperties(info, accessibleName),
    children: linkChildren,
  };

  return {
    type: "element",
    tagName: "div",
    properties: wrapperProps as Properties,
    children: placement === "start" ? [link, heading] : [heading, link],
  };
}
