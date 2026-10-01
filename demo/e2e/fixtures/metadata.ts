/** Build-time HTTP fixtures. There is deliberately no real-network fallback. */
export const E2E_FAILURE_URL = "https://metadata-failure.example.test/unavailable";

const assetBase = "http://127.0.0.1:4173/e2e-assets/";

const metadata = new Map([
  [
    "https://github.com/ItoShimeji/satteri-links",
    {
      title: "Satteri Links fixture repository",
      siteName: "GitHub fixture",
      description: "Deterministic preview for the Satteri Links demo repository.",
    },
  ],
  [
    "https://astro.build/",
    {
      title: "Astro fixture homepage",
      siteName: "Astro fixture",
      description: "Deterministic preview for the Astro homepage.",
    },
  ],
  [
    "https://github.com/withastro/astro",
    {
      title: "Astro fixture repository",
      siteName: "GitHub fixture",
      description: "Deterministic preview for the Astro source repository.",
    },
  ],
  [
    "https://astro.build/blog/astro-640/",
    {
      title: "Astro fixture release",
      siteName: "Astro fixture",
      description: "Deterministic preview for the Astro release announcement.",
    },
  ],
]);

export const fixtureFetch: typeof globalThis.fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);

  if (url === E2E_FAILURE_URL) {
    return new Response("Fixture metadata is unavailable", { status: 503 });
  }

  const fixture = metadata.get(url);
  if (!fixture) {
    throw new Error(`No build-time E2E metadata fixture for ${url}`);
  }

  // These values are fixed trusted fixture strings. The real package still
  // performs the HTTP response parsing and generates all preview HTML.
  return new Response(
    `<!doctype html><html><head>
      <title>${fixture.title}</title>
      <meta property="og:title" content="${fixture.title}">
      <meta property="og:site_name" content="${fixture.siteName}">
      <meta property="og:description" content="${fixture.description}">
      <meta property="og:image" content="${assetBase}thumbnail.svg">
      <link rel="icon" href="${assetBase}favicon.svg">
    </head><body></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};
