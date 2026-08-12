import type { Element, ElementContent, Properties } from "hast";
import { defaultHeadingLinkIcon, iconContent } from "./icon.js";
import type {
  Build,
  HeadingLinkIcon,
  HeadingLinkInfo,
  SatteriHeadingLinkOptions,
} from "./types.js";

function build<T>(value: Build<T> | undefined, info: HeadingLinkInfo): T | undefined {
  if (value === undefined) return undefined;
  return typeof value === "function" ? (value as (info: HeadingLinkInfo) => T)(info) : value;
}

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

function renderHeadingProperties(
  properties: Properties | undefined,
  heading: Readonly<Element>,
): Properties {
  const sourceProperties = heading.properties ?? {};
  const sourceClasses = classList(
    sourceProperties.className ?? (sourceProperties as Record<string, unknown>).class,
  );
  const result = mergeClassName(["satteri-heading-link__heading", ...sourceClasses], {
    ...sourceProperties,
    ...properties,
  }) as Record<string, unknown>;
  result.id = sourceProperties.id;
  return result as Properties;
}

function renderLinkProperties(
  properties: Properties,
  info: HeadingLinkInfo,
  accessibleName: string | undefined,
): Properties {
  const result = { ...properties } as Record<string, unknown>;
  for (const key of [
    "href",
    "ariaHidden",
    "aria-hidden",
    "tabIndex",
    "tabindex",
    "ariaLabel",
    "aria-label",
    "ariaLabelledby",
    "aria-labelledby",
  ]) {
    delete result[key];
  }
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
  const wrapperProperties = mergeClassName(
    ["satteri-heading-link", `satteri-heading-link--h${info.level}`],
    build(options.wrapperProperties, info) ?? {},
  ) as Record<string, unknown>;
  wrapperProperties["data-satteri-heading-link"] = true;

  return {
    type: "element",
    tagName: "div",
    properties: wrapperProperties as Properties,
    children: [
      {
        ...info.heading,
        properties: renderHeadingProperties(build(options.headingProperties, info), info.heading),
      },
      {
        type: "element",
        tagName: "a",
        properties: renderLinkProperties(
          build(options.linkProperties, info) ?? {},
          info,
          accessibleName,
        ),
        children: linkChildren,
      },
    ],
  };
}
