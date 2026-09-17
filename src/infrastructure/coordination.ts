import { randomUUID } from 'node:crypto';

export interface KeyValueStore {
  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<'OK' | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  lPush(key: string, value: string): Promise<number>;
  brPop(key: string, timeoutSeconds: number): Promise<{ element: string } | null>;
}

export interface Lease {
  key: string;
  token: string;
  expiresAt: number;
}

export class DistributedLeaseManager {
  constructor(private readonly store: KeyValueStore, private readonly prefix = 'zero-farmer:lease') {}

  async acquire(resource: string, ttlMs = 60_000): Promise<Lease | null> {
    const token = randomUUID();
    const key = `${this.prefix}:${resource}`;
    const result = await this.store.set(key, token, { nx: true, px: ttlMs });
    if (result !== 'OK') return null;
    return { key, token, expiresAt: Date.now() + ttlMs };
  }

  async release(lease: Lease): Promise<boolean> {
    const current = await this.store.get(lease.key);
    if (current !== lease.token) return false;
    return (await this.store.del(lease.key)) > 0;
  }
}

export interface QueueEnvelope<T> {
  id: string;
  queuedAt: string;
  payload: T;
}

export class DurableQueue<T> {
  constructor(private readonly store: KeyValueStore, private readonly key = 'zero-farmer:jobs') {}

  async enqueue(payload: T): Promise<QueueEnvelope<T>> {
    const item: QueueEnvelope<T> = { id: randomUUID(), queuedAt: new Date().toISOString(), payload };
    await this.store.lPush(this.key, JSON.stringify(item));
    return item;
  }

  async next(timeoutSeconds = 5): Promise<QueueEnvelope<T> | null> {
    const result = await this.store.brPop(this.key, timeoutSeconds);
    if (!result) return null;
    return JSON.parse(result.element) as QueueEnvelope<T>;
  }
}
