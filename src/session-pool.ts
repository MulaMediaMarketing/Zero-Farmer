import type { IOSDeviceDriver } from './device-driver.js';

interface SessionEntry {
  deviceId: string;
  sessionId: string;
  updatedAt: number;
}

export class AppiumSessionPool {
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(private readonly driver: IOSDeviceDriver, private readonly maxIdleMs = 120_000) {}

  async acquire(deviceId: string, capabilities: Record<string, unknown>): Promise<string> {
    const existing = this.sessions.get(deviceId);
    if (existing && Date.now() - existing.updatedAt <= this.maxIdleMs) {
      existing.updatedAt = Date.now();
      return existing.sessionId;
    }
    if (existing) await this.destroy(deviceId);
    const sessionId = await this.driver.createSession(capabilities);
    this.sessions.set(deviceId, { deviceId, sessionId, updatedAt: Date.now() });
    return sessionId;
  }

  touch(deviceId: string): void {
    const existing = this.sessions.get(deviceId);
    if (existing) existing.updatedAt = Date.now();
  }

  get(deviceId: string): string | undefined {
    return this.sessions.get(deviceId)?.sessionId;
  }

  async destroy(deviceId: string): Promise<void> {
    const existing = this.sessions.get(deviceId);
    if (!existing) return;
    this.sessions.delete(deviceId);
    await this.driver.deleteSession(existing.sessionId).catch(() => undefined);
  }

  async sweep(): Promise<number> {
    const now = Date.now();
    const stale = [...this.sessions.values()].filter((entry) => now - entry.updatedAt > this.maxIdleMs);
    await Promise.all(stale.map((entry) => this.destroy(entry.deviceId)));
    return stale.length;
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((deviceId) => this.destroy(deviceId)));
  }
}
