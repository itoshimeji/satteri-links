import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { MetadataCache } from "./cache.ts";
import { FetchQueue } from "./concurrency.ts";
import {
  createImageResolver,
  createLinkPreviewResolvers,
  createMetadataResolver,
} from "./factory.ts";
import type { ImageCacheStore } from "./types.ts";

const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function imageStore(): ImageCacheStore {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue({ src: "/cached/image.png" }),
  };
}

function controlledFetch() {
  const started: string[] = [];
  const bodies = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  const signals = new Map<string, AbortSignal>();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    started.push(url);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodies.set(url, controller);
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
      },
    });
    if (init?.signal) signals.set(url, init.signal);
    return new Response(body, {
      headers: { "content-type": url.endsWith(".png") ? "image/png" : "text/html" },
    });
  });
  function finish(url: string) {
    const controller = bodies.get(url)!;
    controller.enqueue(
      new TextEncoder().encode(url.endsWith(".png") ? "image" : "<title>Title</title>"),
    );
    controller.close();
  }
  return { fetch, started, finish, signals, bodies };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

describe("fetch concurrency", () => {
  test.each([
    { count: 70, sameHost: false, limit: 64 },
    { count: 8, sameHost: true, limit: 4 },
  ])("enforces default limits: $limit active requests", async ({ count, sameHost, limit }) => {
    const transport = controlledFetch();
    const resolve = createMetadataResolver({ fetch: transport.fetch });
    const urls = Array.from(
      { length: count },
      (_, i) => `https://${sameHost ? "example" : `host${i}`}.test/${i}`,
    );
    const requests = urls.map((url) => resolve(new URL(url)));
    await flush();
    expect(transport.started).toHaveLength(limit);
    for (let i = 0; i < count; i += 1) {
      await vi.waitFor(() => expect(transport.started.length).toBeGreaterThan(i));
      transport.finish(transport.started[i]!);
    }
    expect((await Promise.all(requests)).every((metadata) => metadata?.title === "Title")).toBe(
      true,
    );
  });

  test("skips saturated hosts and counts schemes and ports under the same hostname", async () => {
    const transport = controlledFetch();
    const resolve = createMetadataResolver({
      fetch: transport.fetch,
      maxConcurrentRequests: 3,
      maxConcurrentRequestsPerHost: 1,
    });
    const urls = ["https://EXAMPLE.test/a", "http://example.test:8080/b", "https://other.test/c"];
    const requests = urls.map((url) => resolve(new URL(url)));
    await flush();
    expect(transport.started).toEqual(["https://example.test/a", urls[2]]);
    transport.finish(urls[2]!);
    await requests[2];
    expect(transport.started).toHaveLength(2);
    transport.finish("https://example.test/a");
    await vi.waitFor(() => expect(transport.started).toHaveLength(3));
    transport.finish(urls[1]!);
    await Promise.all(requests);
  });

  test("shares the total budget between metadata, images and favicons until body completion", async () => {
    const transport = controlledFetch();
    const { resolveMetadata, resolveImage } = createLinkPreviewResolvers({
      fetch: transport.fetch,
      maxConcurrentRequests: 2,
      maxConcurrentRequestsPerHost: 2,
      image: { store: imageStore() },
    });
    const html = resolveMetadata(new URL("https://page.test/article"));
    const image = resolveImage!("https://cdn.test/card.png");
    const favicon = resolveImage!("https://icons.test/favicon.png");
    await flush();
    // Both fetch promises already returned their headers, but bodies remain open.
    expect(transport.started).toEqual(["https://page.test/article", "https://cdn.test/card.png"]);
    transport.finish("https://cdn.test/card.png");
    await image;
    await vi.waitFor(() => expect(transport.started).toHaveLength(3));
    transport.finish("https://icons.test/favicon.png");
    transport.finish("https://page.test/article");
    await Promise.all([html, favicon]);
  });

  test("shares host budgets between metadata and assets without blocking another host", async () => {
    const transport = controlledFetch();
    const { resolveMetadata, resolveImage } = createLinkPreviewResolvers({
      fetch: transport.fetch,
      maxConcurrentRequests: 3,
      maxConcurrentRequestsPerHost: 1,
      image: { store: imageStore() },
    });
    const page = resolveMetadata(new URL("https://example.test/page"));
    const image = resolveImage!("http://example.test:8080/card.png");
    const favicon = resolveImage!("https://other.test/icon.png");
    await flush();
    expect(transport.started).toEqual(["https://example.test/page", "https://other.test/icon.png"]);
    transport.finish("https://other.test/icon.png");
    await favicon;
    expect(transport.started).toHaveLength(2);
    transport.finish("https://example.test/page");
    await page;
    await flush();
    expect(transport.started).toHaveLength(3);
    transport.finish("http://example.test:8080/card.png");
    await image;
  });

  test("holds a metadata slot until early body cancellation completes", async () => {
    const cancelled = deferred();
    const allowCancel = deferred();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<head><title>Title</title></head>"));
            },
            cancel() {
              cancelled.resolve();
              return allowCancel.promise;
            },
          }),
          { headers: { "content-type": "text/html" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response("<title>Next</title>", { headers: { "content-type": "text/html" } }),
      );
    const resolve = createMetadataResolver({ fetch, maxConcurrentRequests: 1 });
    const first = resolve(new URL("https://one.test/a"));
    const second = resolve(new URL("https://two.test/b"));
    await cancelled.promise;
    expect(fetch).toHaveBeenCalledTimes(1);
    allowCancel.resolve();
    expect((await first)?.title).toBe("Title");
    expect((await second)?.title).toBe("Next");
  });

  test("deduplicates requests while queued and active, before acquiring slots", async () => {
    const transport = controlledFetch();
    const { resolveMetadata, resolveImage } = createLinkPreviewResolvers({
      fetch: transport.fetch,
      maxConcurrentRequests: 1,
      image: { store: imageStore() },
    });
    const url = new URL("https://example.test/page");
    const first = resolveMetadata(url);
    const duplicate = resolveMetadata(url);
    const image = resolveImage!("https://example.test/card.png");
    const imageDuplicate = resolveImage!("https://example.test/card.png");
    await flush();
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    transport.finish(url.href);
    await Promise.all([first, duplicate]);
    await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledTimes(2));
    transport.finish("https://example.test/card.png");
    await Promise.all([image, imageDuplicate]);
    expect(transport.fetch).toHaveBeenCalledTimes(2);
  });

  test("returns metadata and image cache hits even when the queue is full", async () => {
    const directory = await mkdtemp(join(tmpdir(), "preview-concurrency-"));
    directories.push(directory);
    const url = new URL("https://cached.test/page");
    await new MetadataCache({ directory }).set(url.href, { url: url.href, title: "Cached" });
    const transport = controlledFetch();
    const store = imageStore();
    store.get = vi.fn().mockResolvedValue({ src: "/cached/icon.png" });
    const { resolveMetadata, resolveImage } = createLinkPreviewResolvers({
      fetch: transport.fetch,
      cache: { directory },
      maxConcurrentRequests: 1,
      image: { store },
    });
    const active = resolveMetadata(new URL("https://active.test/page"));
    await vi.waitFor(() => expect(transport.started).toHaveLength(1));
    expect((await resolveMetadata(url))?.title).toBe("Cached");
    expect(await resolveImage!("https://cached.test/icon.png")).toBe("/cached/icon.png");
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    transport.finish("https://active.test/page");
    await active;
  });

  test("starts the communication timeout after leaving the queue", async () => {
    vi.useFakeTimers();
    const transport = controlledFetch();
    const { resolveMetadata, resolveImage } = createLinkPreviewResolvers({
      fetch: transport.fetch,
      timeoutMs: 1000,
      maxConcurrentRequests: 1,
      image: { store: imageStore(), timeoutMs: 10 },
    });
    const first = resolveMetadata(new URL("https://example.test/page"));
    const image = resolveImage!("https://example.test/card.png");
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.started).toHaveLength(1);
    transport.finish("https://example.test/page");
    await first;
    await flush();
    expect(transport.signals.get("https://example.test/card.png")?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(9);
    expect(transport.signals.get("https://example.test/card.png")?.aborted).toBe(false);
    transport.finish("https://example.test/card.png");
    expect(await image).toBe("/cached/image.png");
  });

  test("releases timed-out body reads for the next request", async () => {
    vi.useFakeTimers();
    const transport = controlledFetch();
    const resolve = createImageResolver({
      fetch: transport.fetch,
      timeoutMs: 10,
      maxConcurrentRequests: 1,
      store: imageStore(),
    });
    const first = resolve("https://example.test/slow.png");
    const second = resolve("https://example.test/next.png");
    await flush();
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toBe("https://example.test/slow.png");
    expect(transport.started).toHaveLength(2);
    transport.finish("https://example.test/next.png");
    expect(await second).toBe("/cached/image.png");
  });

  test.each([
    "status",
    "content-type",
    "declared-size",
    "streamed-size",
    "body-error",
    "cancel-error",
    "fetch-error",
  ])("cancels/releases an image slot after %s", async (failure) => {
    const cancel = vi.fn(() =>
      failure === "cancel-error" ? Promise.reject(new Error("Cancel failed")) : undefined,
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (failure === "body-error") controller.error(new Error("Read failed"));
        else controller.enqueue(Uint8Array.from([1, 2, 3]));
      },
      cancel,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(body, {
          status: failure === "status" ? 500 : 200,
          headers: {
            "content-type":
              failure === "content-type" || failure === "cancel-error" ? "text/plain" : "image/png",
            ...(failure === "declared-size" ? { "content-length": "100" } : {}),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([1]), { headers: { "content-type": "image/png" } }),
      );
    if (failure === "fetch-error")
      fetch
        .mockReset()
        .mockRejectedValueOnce(new Error("Fetch failed"))
        .mockResolvedValueOnce(
          new Response(Uint8Array.from([1]), { headers: { "content-type": "image/png" } }),
        );
    const resolve = createImageResolver({
      fetch,
      store: imageStore(),
      maxBytes: 2,
      maxConcurrentRequests: 1,
    });
    const first = resolve("https://example.test/bad.png");
    const second = resolve("https://example.test/good.png");
    expect(await first).toBe("https://example.test/bad.png");
    expect(await second).toBe("/cached/image.png");
    if (failure !== "body-error" && failure !== "fetch-error")
      expect(cancel).toHaveBeenCalledTimes(1);
  });

  test.each([500, 200])(
    "cancels rejected metadata bodies and releases their slots (%s)",
    async (status) => {
      const cancel = vi.fn();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(new ReadableStream({ cancel }), {
            status,
            headers: { "content-type": "text/plain" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("<title>Next</title>", { headers: { "content-type": "text/html" } }),
        );
      const resolve = createMetadataResolver({ fetch, maxConcurrentRequests: 1 });
      const first = resolve(new URL("https://example.test/bad"));
      const second = resolve(new URL("https://example.test/next"));
      expect(await first).toBeUndefined();
      expect((await second)?.title).toBe("Next");
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  test("keeps separate resolver groups independent", async () => {
    const transport = controlledFetch();
    const options = { fetch: transport.fetch, maxConcurrentRequests: 1 };
    const a = createLinkPreviewResolvers(options);
    const b = createLinkPreviewResolvers(options);
    const requests = [
      a.resolveMetadata(new URL("https://example.test/a")),
      b.resolveMetadata(new URL("https://example.test/b")),
    ];
    await flush();
    expect(transport.started).toHaveLength(2);
    transport.started.forEach(transport.finish);
    await Promise.all(requests);
  });

  test.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid limits: %s",
    (limit) => {
      expect(() => createMetadataResolver({ maxConcurrentRequests: limit })).toThrow(RangeError);
      expect(() =>
        createImageResolver({ store: imageStore(), maxConcurrentRequestsPerHost: limit }),
      ).toThrow(RangeError);
    },
  );

  test("releases slots even when the request callback throws synchronously", async () => {
    const queue = new FetchQueue({ maxConcurrentRequests: 1 });
    const first = queue.run(new URL("https://example.test/a"), () => {
      throw new Error("Failed");
    });
    const second = queue.run(new URL("https://example.test/b"), async () => "Next");
    await expect(first).rejects.toThrow("Failed");
    await expect(second).resolves.toBe("Next");
  });
});
