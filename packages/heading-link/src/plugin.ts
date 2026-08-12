import type { Element } from "hast";
import { defineHastPlugin } from "satteri";
import type { HastVisitorContext } from "satteri";
import { renderHeadingLink } from "./render.js";
import type { HeadingLevel, HeadingLinkInfo, SatteriHeadingLinkOptions } from "./types.js";

const ALL_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];
const HEADING_TAGS = ALL_LEVELS.map((level) => `h${level}`);

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "element"
  );
}

function hasHeadingLinkParent(node: Readonly<Element>, ctx: HastVisitorContext): boolean {
  const parent = ctx.parent(node);
  return isElement(parent) && Boolean(parent.properties?.["data-satteri-heading-link"]);
}

function reportMissingId(
  node: Readonly<Element>,
  behavior: SatteriHeadingLinkOptions["missingId"],
  ctx: HastVisitorContext,
): void {
  if (behavior === "skip") return;
  const message = `satteri-heading-link: <${node.tagName}> is missing a non-empty id; the heading permalink was skipped.`;
  if (behavior === "error") throw new Error(message);
  ctx.report({ message, node, severity: "warning" });
  console.warn(message);
}

export function satteriHeadingLink(options: SatteriHeadingLinkOptions = {}) {
  const levels = options.levels ?? ALL_LEVELS;
  const filter = levels.map((level) => `h${level}`);
  const selected = new Set(levels);
  const missingIdBehavior = options.missingId ?? "skip";

  return defineHastPlugin({
    name: "satteri-heading-link",
    element: {
      filter: filter.length > 0 ? filter : HEADING_TAGS,
      visit(node, ctx) {
        if (hasHeadingLinkParent(node, ctx)) return;
        const level = Number(node.tagName.slice(1)) as HeadingLevel;
        if (!selected.has(level)) return;

        const rawId = node.properties?.id;
        if (typeof rawId !== "string" || rawId.length === 0) {
          reportMissingId(node, missingIdBehavior, ctx);
          return;
        }

        const info: HeadingLinkInfo = {
          id: rawId,
          text: ctx.textContent(node),
          level,
          heading: node,
        };
        const customAccessibleName =
          options.accessibleName === undefined || options.accessibleName === "heading"
            ? undefined
            : options.accessibleName(info);
        const accessibleName = customAccessibleName?.trim() ? customAccessibleName : undefined;
        if (customAccessibleName !== undefined && accessibleName === undefined) {
          ctx.report({
            message: `satteri-heading-link: accessibleName returned an empty string for #${rawId}; falling back to the heading text.`,
            node,
            severity: "warning",
          });
        }
        return renderHeadingLink(options, info, accessibleName);
      },
    },
  });
}
