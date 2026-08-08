/**
 * Minimal in-memory stand-in for the subset of the ioredis API Module 1
 * uses (get/set with EX|NX|KEEPTTL/del/incr/expire) — used across unit
 * tests instead of a real Redis instance ("mock repositories/Redis" per
 * the task spec).
 */
export class FakeRedis {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  private evictIfExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.evictIfExpired(key);
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<string | null> {
    this.evictIfExpired(key);
    const existing = this.store.get(key);
    let expiresAt = existing?.expiresAt ?? null;
    let nx = false;

    for (let i = 0; i < args.length; i++) {
      const token = args[i];
      if (token === "EX") {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        i++;
      } else if (token === "NX") {
        nx = true;
      }
      // "KEEPTTL" is a no-op here since `expiresAt` already defaults to the existing TTL.
    }

    if (nx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async incr(key: string): Promise<number> {
    this.evictIfExpired(key);
    const entry = this.store.get(key);
    const next = Number(entry?.value ?? "0") + 1;
    this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
}
