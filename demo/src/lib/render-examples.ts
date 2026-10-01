import { satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import { markdownToHtml } from "satteri";
import { satteriHeadingLink, type SatteriHeadingLinkOptions } from "satteri-heading-link";
import { satteriLinkCard, type SatteriLinkCardOptions } from "satteri-link-card";
import { satteriLinkMention, type SatteriLinkMentionOptions } from "satteri-link-mention";

export const isE2EBuild = process.env.SATTERI_E2E === "1";

// Only explicit E2E builds load fixtures. Normal demo builds retain each
// package's production defaults, including metadata cache behavior.
const fixtures = isE2EBuild ? await import("../../e2e/fixtures/metadata") : undefined;
const fixtureOptions = fixtures
  ? { fetch: fixtures.fixtureFetch, metadataCache: false as const, imageCache: false as const }
  : {};

export const e2eFailureUrl = fixtures?.E2E_FAILURE_URL;

export async function renderCard(source: string, options: SatteriLinkCardOptions = {}) {
  return markdownToHtml(source, {
    hastPlugins: [satteriLinkCard({ ...options, ...fixtureOptions })],
  });
}

export async function renderMention(source: string, options: SatteriLinkMentionOptions = {}) {
  return markdownToHtml(source, {
    hastPlugins: [satteriLinkMention({ ...options, ...fixtureOptions })],
  });
}

export async function renderHeadingExample(
  source: string,
  options: SatteriHeadingLinkOptions = {},
) {
  const result = await markdownToHtml(source, {
    hastPlugins: [() => satteriHeadingIdsPlugin(), satteriHeadingLink(options)],
  });
  return result.html;
}
