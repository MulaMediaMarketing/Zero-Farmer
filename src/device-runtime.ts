import type { DeviceTwin } from './types.js';
import type { IOSDeviceDriver } from './device-driver.js';
import type { DeviceDiscoveryPort, DiscoveredIOSDevice } from './device-discovery.js';
import { AppiumSessionPool } from './session-pool.js';

export interface DeviceRegistryPort {
  upsert(device: Omit<DeviceTwin, 'lastSeenAt' | 'failureCount'> & Partial<Pick<DeviceTwin, 'lastSeenAt' | 'failureCount'>>): DeviceTwin;
  get(id: string): DeviceTwin | undefined;
  list(): DeviceTwin[];
}

export interface DeviceRuntimeOptions {
  appiumPortBase?: number;
  wdaPortBase?: number;
  failureThreshold?: number;
  heartbeatIntervalMs?: number;
}

export class DeviceRuntimeManager {
  private readonly ports = new Map<string, { appiumPort: number; wdaPort: number }>();
  private heartbeat?: NodeJS.Timeout;
  private readonly failureThreshold: number;
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly discovery: DeviceDiscoveryPort,
    private readonly registry: DeviceRegistryPort,
    private readonly driverFactory: (device: DeviceTwin) => IOSDeviceDriver,
    private readonly options: DeviceRuntimeOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  }

  async reconcile(): Promise<DeviceTwin[]> {
    const discovered = await this.discovery.discover();
    const seen = new Set(discovered.map((device) => device.udid));
    const reconciled = discovered.map((device, index) => this.upsertDiscovered(device, index));

    for (const existing of this.registry.list()) {
      if (!seen.has(existing.udid) && existing.health !== 'quarantined') {
        existing.health = 'offline';
        existing.lastSeenAt = new Date().toISOString();
      }
    }
    return reconciled;
  }

  private upsertDiscovered(device: DiscoveredIOSDevice, index: number): DeviceTwin {
    const id = device.udid;
    let ports = this.ports.get(id);
    if (!ports) {
      ports = {
        appiumPort: (this.options.appiumPortBase ?? 4723) + index,
        wdaPort: (this.options.wdaPortBase ?? 8100) + index,
      };
      this.ports.set(id, ports);
    }
    const existing = this.registry.get(id);
    return this.registry.upsert({
      id,
      name: device.name,
      udid: device.udid,
      iosVersion: device.iosVersion,
      appiumPort: ports.appiumPort,
      wdaPort: ports.wdaPort,
      health: existing?.health === 'quarantined' ? 'quarantined' : 'online',
      tags: existing?.tags ?? ['physical-ios'],
      lastSeenAt: new Date().toISOString(),
      failureCount: existing?.failureCount ?? 0,
    });
  }

  async heartbeatOnce(): Promise<void> {
    await this.reconcile();
    for (const device of this.registry.list()) {
      if (device.health === 'offline' || device.health === 'quarantined') continue;
      try {
        const driver = this.driverFactory(device);
        await driver.status();
        device.failureCount = 0;
        if (device.health === 'degraded') device.health = 'online';
        device.lastSeenAt = new Date().toISOString();
      } catch {
        device.failureCount += 1;
        device.health = device.failureCount >= this.failureThreshold ? 'quarantined' : 'degraded';
      }
    }
  }

  start(): void {
    if (this.heartbeat) return;
    void this.heartbeatOnce();
    this.heartbeat = setInterval(() => void this.heartbeatOnce(), this.heartbeatIntervalMs);
    this.heartbeat.unref?.();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  async recover(deviceId: string): Promise<boolean> {
    const device = this.registry.get(deviceId);
    if (!device) return false;
    try {
      await this.driverFactory(device).status();
      device.failureCount = 0;
      device.health = 'online';
      device.lastSeenAt = new Date().toISOString();
      return true;
    } catch {
      return false;
    }
  }
}

export class DeviceSessionRuntime {
  private readonly pools = new Map<string, AppiumSessionPool>();

  constructor(private readonly driverFactory: (device: DeviceTwin) => IOSDeviceDriver) {}

  private pool(device: DeviceTwin): AppiumSessionPool {
    let pool = this.pools.get(device.id);
    if (!pool) {
      pool = new AppiumSessionPool(this.driverFactory(device));
      this.pools.set(device.id, pool);
    }
    return pool;
  }

  async session(device: DeviceTwin, extraCapabilities: Record<string, unknown> = {}): Promise<string> {
    return this.pool(device).acquire(device.id, {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': device.udid,
      'appium:wdaLocalPort': device.wdaPort,
      'appium:newCommandTimeout': 120,
      ...extraCapabilities,
    });
  }

  async screenshot(device: DeviceTwin): Promise<string> {
    const sessionId = await this.session(device);
    return this.driverFactory(device).screenshot(sessionId);
  }

  async reset(device: DeviceTwin): Promise<void> {
    await this.pool(device).destroy(device.id);
  }

  async close(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.close()));
    this.pools.clear();
  }
}
