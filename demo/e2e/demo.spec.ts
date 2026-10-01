import { expect, test as base, type Locator } from "@playwright/test";

const repositoryURL = "https://github.com/ItoShimeji/satteri-links";
const astroURL = "https://astro.build/";
const astroRepositoryURL = "https://github.com/withastro/astro";
const releaseURL = "https://astro.build/blog/astro-640/";
const failureURL = "https://metadata-failure.example.test/unavailable";

// These are build-time fixture tests, not browser-level metadata mocks. Fail
// any attempt to fetch external images/scripts/etc. from the finished demo.
const test = base.extend<{ localRequestsOnly: void }>({
  localRequestsOnly: [
    async ({ context, page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const externalRequests: string[] = [];
      const browserErrors: string[] = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin || url.protocol === "data:" || url.protocol === "blob:") {
          await route.continue();
        } else {
          externalRequests.push(url.href);
          await route.abort("blockedbyclient");
        }
      });
      await use();
      expect(externalRequests, "The fixture demo must not request external resources").toEqual([]);
      expect(browserErrors, "The production preview must have no browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

async function expectLoadedLocalImages(images: Locator) {
  expect(await images.count(), "Expected at least one fixture image").toBeGreaterThan(0);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("src", /^http:\/\/127\.0\.0\.1:4173\/e2e-assets\//);
    await expect(image).toHaveAttribute("alt", "");
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
      )
      .toBe(true);
  }
}

async function childClasses(element: Locator) {
  return element.evaluate((node) => Array.from(node.children, (child) => child.className));
}

test("navigates all demo routes and restores active navigation on back/forward", async ({
  page,
}) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const routes = [
    { label: "Home", path: "/", title: "Satteri Links" },
    { label: "Link Card", path: "/link-card/", title: "satteri-link-card" },
    { label: "Heading Link", path: "/heading-link/", title: "satteri-heading-link" },
    { label: "Link Mention", path: "/link-mention/", title: "satteri-link-mention" },
  ];
  for (const route of routes) {
    if (route.path !== "/")
      await navigation.getByRole("link", { name: route.label, exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:4173${route.path}`);
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.getByRole("link", { name: route.label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toContainText(
      route.title,
    );
    await expect(page.getByRole("main")).toBeVisible();
  }
  await page.goBack();
  await expect(page).toHaveURL("http://127.0.0.1:4173/heading-link/");
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Heading Link");
  await page.goForward();
  await expect(page).toHaveURL("http://127.0.0.1:4173/link-mention/");
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Link Mention");
});

test("renders a metadata-rich card from the built package with working local images", async ({
  page,
}) => {
  await page.goto("/link-card/");
  const card = page.locator("a.satteri-link-card").first();
  await expect(card).toHaveAttribute("href", repositoryURL);
  await expect(card.locator(".satteri-link-card__title")).toHaveText(
    "Satteri Links fixture repository",
  );
  await expect(card.locator(".satteri-link-card__description")).toHaveText(
    "Deterministic preview for the Satteri Links demo repository.",
  );
  await expect(card.locator(".satteri-link-card__host")).toHaveText("github.com");
  await expect(card).toHaveAccessibleName(/Satteri Links fixture repository/);
  await expect(card).toHaveCSS("display", "grid");
  await expect(card.locator(".satteri-link-card__image")).toHaveCSS("object-fit", "cover");
  expect(await childClasses(card)).toEqual(["satteri-link-card__body", "satteri-link-card__media"]);
  await expectLoadedLocalImages(card.locator("img"));
});

test("applies card thumbnail position, full URL and favicon options without overflow", async ({
  page,
}) => {
  await page.goto("/link-card/");
  const cards = page.locator("a.satteri-link-card");
  await expect(cards).toHaveCount(5);
  const withoutThumbnail = cards.nth(1);
  await expect(withoutThumbnail).toHaveAttribute("href", astroURL);
  await expect(withoutThumbnail.locator(".satteri-link-card__media")).toHaveCount(0);
  await expect(withoutThumbnail.locator(".satteri-link-card__favicon")).toHaveCount(1);
  expect(await childClasses(cards.nth(2))).toEqual([
    "satteri-link-card__media",
    "satteri-link-card__body",
  ]);
  await expect(cards.nth(2)).toHaveAttribute("href", astroURL);
  await expect(cards.nth(3)).toHaveAttribute("href", astroRepositoryURL);
  await expect(cards.nth(3).locator(".satteri-link-card__host")).toHaveText(astroRepositoryURL);
  await expect(cards.nth(4).locator(".satteri-link-card__favicon")).toHaveCount(0);
  await expect(cards.nth(4).locator(".satteri-link-card__image")).toHaveCount(1);
  await expectLoadedLocalImages(cards.locator("img"));
  for (const [index, position] of [
    [0, "right"],
    [2, "left"],
  ] as const) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    const body = await card.locator(".satteri-link-card__body").boundingBox();
    const media = await card.locator(".satteri-link-card__media").boundingBox();
    expect(body).not.toBeNull();
    expect(media).not.toBeNull();
    if (position === "right") expect(media!.x).toBeGreaterThan(body!.x);
    else expect(media!.x).toBeLessThan(body!.x);
  }
  for (const card of await cards.all()) {
    const geometry = await card.evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  }
});

test("leaves authored, nested, multiple and ignored card links intact and survives metadata failure", async ({
  page,
}) => {
  await page.goto("/link-card/");
  const main = page.getByRole("main");
  const authored = main.getByRole("link", { name: "Astro documentation", exact: true });
  await expect(authored).toHaveAttribute("href", astroURL);
  await expect(authored).not.toHaveClass(/satteri-link-card/);
  await expect(main.locator(`li a[href="${astroURL}"]`)).toHaveText(astroURL);
  await expect(main.locator('a[href="https://example.com/manual.pdf"]')).toHaveText(
    "https://example.com/manual.pdf",
  );
  const multiple = main.locator("p").filter({ hasText: `${repositoryURL} ${astroURL}` });
  await expect(multiple.locator("a")).toHaveCount(2);
  await expect(multiple.locator(".satteri-link-card")).toHaveCount(0);
  const fallback = main.locator('[data-e2e="card-metadata-failure"]');
  await expect(fallback.locator("a")).toHaveAttribute("href", failureURL);
  await expect(fallback.locator("a")).toHaveText(failureURL);
  await expect(fallback.locator(".satteri-link-card")).toHaveCount(0);
});

test("renders mention parts in configured order and supports favicon and title-only options", async ({
  page,
}) => {
  await page.goto("/link-mention/");
  const mentions = page.locator("a.satteri-link-mention");
  await expect(mentions).toHaveCount(5);
  const defaultMention = mentions.first();
  await expect(defaultMention).toHaveAttribute("href", repositoryURL);
  await expect(defaultMention.locator(".satteri-link-mention__site-name")).toHaveText(
    "GitHub fixture",
  );
  await expect(defaultMention.locator(".satteri-link-mention__title")).toHaveText(
    "Satteri Links fixture repository",
  );
  await expect(defaultMention).toHaveAccessibleName(
    /^GitHub fixture\s*Satteri Links fixture repository$/,
  );
  await expect(defaultMention).toHaveCSS("display", "inline");
  expect(await childClasses(defaultMention)).toEqual([
    "satteri-link-mention__favicon",
    "satteri-link-mention__site-name",
    "satteri-link-mention__title",
  ]);
  expect(await childClasses(mentions.nth(1))).toEqual([
    "satteri-link-mention__site-name",
    "satteri-link-mention__title",
    "satteri-link-mention__favicon",
  ]);
  await expect(mentions.nth(2)).toHaveAttribute("href", releaseURL);
  await expect(mentions.nth(2).locator("img")).toHaveCount(0);
  await expect(mentions.nth(2).locator(".satteri-link-mention__site-name")).toHaveText(
    "Astro fixture",
  );
  await expect(mentions.nth(3)).toHaveAttribute("href", releaseURL);
  await expect(mentions.nth(3)).toHaveText("Astro fixture release");
  expect(await childClasses(mentions.nth(3))).toEqual(["satteri-link-mention__title"]);
  await expectLoadedLocalImages(mentions.locator("img"));
});

test("converts empty links in lists while preserving authored labels, bare URLs and failure fallback", async ({
  page,
}) => {
  await page.goto("/link-mention/");
  const main = page.getByRole("main");
  await expect(main.locator("li a.satteri-link-mention")).toHaveCount(1);
  await expect(main.locator("li a.satteri-link-mention")).toHaveAttribute("href", repositoryURL);
  const authored = main.getByRole("link", { name: "Sätteri documentation", exact: true });
  await expect(authored).toHaveAttribute("href", "https://satteri.bruits.org/");
  await expect(authored).not.toHaveClass(/satteri-link-mention/);
  await expect(main.getByRole("link", { name: astroURL, exact: true })).toHaveAttribute(
    "href",
    astroURL,
  );
  const fallback = main.locator('[data-e2e="mention-metadata-failure"]');
  await expect(fallback).toHaveText("Unavailable metadata: .");
  await expect(fallback.locator("a")).toHaveAttribute("href", failureURL);
  await expect(fallback.locator("a")).toHaveText("");
  await expect(fallback.locator(".satteri-link-mention")).toHaveCount(0);
});

test("gives heading permalinks accessible names, visible keyboard focus and Enter hash navigation", async ({
  page,
}) => {
  await page.goto("/heading-link/");
  const heading = page.getByRole("main").getByRole("heading", { level: 1 }).first();
  const id = await heading.getAttribute("id");
  expect(id).toBeTruthy();
  const permalink = page.locator(`a.satteri-heading-link__link[href="#${id}"]`);
  await expect(permalink).toHaveAttribute("aria-labelledby", id!);
  await expect(permalink).toHaveAccessibleName((await heading.innerText()).trim());
  await expect(permalink.locator(".satteri-heading-link__icon")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  // Reach the link through the document's real Tab order, without .focus().
  for (
    let steps = 0;
    steps < 20 && !(await permalink.evaluate((element) => element === document.activeElement));
    steps += 1
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(permalink).toBeFocused();
  await expect(permalink).toHaveCSS("opacity", "1");
  await expect(permalink).toHaveCSS("outline-style", "solid");
  await expect(permalink).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("Enter");
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toBe(`#${id}`);
  expect(new URL(page.url()).pathname).toBe("/heading-link/");
  await page.goBack();
  await expect(page).toHaveURL("http://127.0.0.1:4173/heading-link/");
  const localized = page.getByRole("link", { name: "「日本語の見出し」へのリンク", exact: true });
  await expect(localized).toHaveAttribute("href", /#.+/);
});

test("keeps long heading anchors on the final text line and exposes them on touch screens", async ({
  page,
  isMobile,
}) => {
  await page.goto("/heading-link/");
  const fixture = page.locator('[data-e2e="long-heading"]');
  const heading = fixture.getByRole("heading");
  const permalink = fixture.locator("a.satteri-heading-link__link");
  await expect(heading).toContainText("finalword");
  await fixture.scrollIntoViewIfNeeded();
  const geometry = await fixture.evaluate((element) => {
    const headingElement = element.querySelector(".satteri-heading-link__heading")!;
    const anchor = element.querySelector(".satteri-heading-link__link")!;
    const walker = document.createTreeWalker(headingElement, NodeFilter.SHOW_TEXT);
    let word: DOMRect | undefined;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = node.textContent!.lastIndexOf("finalword");
      if (start === -1) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + "finalword".length);
      word = range.getBoundingClientRect();
    }
    const link = anchor.getBoundingClientRect();
    return {
      wordTop: word?.top,
      wordBottom: word?.bottom,
      linkTop: link.top,
      linkBottom: link.bottom,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      hoverAvailable: matchMedia("(hover: hover) and (pointer: fine)").matches,
    };
  });
  expect(geometry.wordTop).toBeDefined();
  expect(geometry.linkBottom).toBeGreaterThan(geometry.wordTop!);
  expect(geometry.linkTop).toBeLessThan(geometry.wordBottom!);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  if (isMobile) {
    expect(geometry.hoverAvailable).toBe(false);
    await expect(permalink).toHaveCSS("opacity", "1");
    await permalink.tap();
    await expect
      .poll(() => decodeURIComponent(new URL(page.url()).hash))
      .toBe(`#${await heading.getAttribute("id")}`);
  } else {
    expect(geometry.hoverAvailable).toBe(true);
    await page.mouse.move(0, 0);
    await expect(permalink).toHaveCSS("opacity", "0");
    await permalink.hover();
    await expect(permalink).toHaveCSS("opacity", "1");
  }
});
