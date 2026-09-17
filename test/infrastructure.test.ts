import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiKeyAuthenticator, sha256ApiKey } from '../src/infrastructure/auth.js';
import { DistributedLeaseManager, DurableQueue, type KeyValueStore } from '../src/infrastructure/coordination.js';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, { value: string; expiresAt?: number }>();
  private readonly lists = new Map<string, string[]>();

  async set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<'OK' | null> {
    const current = this.values.get(key);
    if (current?.expiresAt && current.expiresAt <= Date.now()) this.values.delete(key);
    if (options?.nx && this.values.has(key)) return null;
    this.values.set(key, { value, expiresAt: options?.px ? Date.now() + options.px : undefined });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const item = this.values.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return item.value;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async lPush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.unshift(value);
    this.lists.set(key, list);
    return list.length;
  }

  async brPop(key: string): Promise<{ element: string } | null> {
    const list = this.lists.get(key) ?? [];
    const element = list.pop();
    return element ? { element } : null;
  }
}

test('distributed lease prevents two workers from owning the same device', async () => {
  const store = new MemoryStore();
  const leases = new DistributedLeaseManager(store);
  const first = await leases.acquire('device:iphone-1');
  const second = await leases.acquire('device:iphone-1');
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(await leases.release(first!), true);
  assert.ok(await leases.acquire('device:iphone-1'));
});

test('durable queue preserves envelope payload', async () => {
  const store = new MemoryStore();
  const queue = new DurableQueue<{ runId: string }>(store);
  const queued = await queue.enqueue({ runId: 'run-1' });
  const next = await queue.next();
  assert.equal(next?.id, queued.id);
  assert.equal(next?.payload.runId, 'run-1');
});

test('api key authenticator compares SHA-256 digests', () => {
  const auth = new ApiKeyAuthenticator([{ id: 'ops', role: 'operator', sha256: sha256ApiKey('secret') }]);
  assert.deepEqual(auth.authenticate('secret'), { id: 'ops', role: 'operator' });
  assert.equal(auth.authenticate('wrong'), null);
});
