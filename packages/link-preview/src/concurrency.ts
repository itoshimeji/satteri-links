import type { FetchConcurrencyOptions } from "./types.js";

type WaitingRequest = { host: string; start: () => void };

export class FetchQueue {
  private readonly total: number;
  private readonly perHost: number;
  private active = 0;
  private readonly hosts = new Map<string, number>();
  private readonly waiting: WaitingRequest[] = [];

  constructor(options: FetchConcurrencyOptions = {}) {
    this.total = options.maxConcurrentRequests ?? 64;
    this.perHost = options.maxConcurrentRequestsPerHost ?? 4;
    for (const limit of [this.total, this.perHost]) {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new RangeError("Fetch concurrency limits must be positive safe integers");
      }
    }
  }

  async run<T>(url: URL, request: () => Promise<T>): Promise<T> {
    const host = url.hostname;
    await new Promise<void>((start) => {
      this.waiting.push({ host, start });
      this.drain();
    });
    try {
      // The callback owns the timeout and response body, so queued time is
      // excluded and a slot survives until reading or cancellation finishes.
      return await request();
    } finally {
      this.active -= 1;
      const remaining = (this.hosts.get(host) ?? 1) - 1;
      if (remaining === 0) {
        this.hosts.delete(host);
      } else {
        this.hosts.set(host, remaining);
      }
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.total) {
      // Skip saturated hosts, preserving arrival order among runnable requests.
      const index = this.waiting.findIndex(
        ({ host }) => (this.hosts.get(host) ?? 0) < this.perHost,
      );
      if (index === -1) {
        return;
      }
      const [next] = this.waiting.splice(index, 1);
      this.active += 1;
      this.hosts.set(next!.host, (this.hosts.get(next!.host) ?? 0) + 1);
      next!.start();
    }
  }
}
