import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceRuntimeManager } from '../src/device-runtime.js';
import { DeviceRegistry } from '../src/platform.js';
import type { DeviceDiscoveryPort } from '../src/device-discovery.js';
import type { IOSDeviceDriver } from '../src/device-driver.js';
import type { DeviceTwin } from '../src/types.js';

class FakeDiscovery implements DeviceDiscoveryPort {
  async discover() {
    return [{ name: 'iPhone 16', udid: '00008110-001234567890801E', iosVersion: '18.0', connected: true }];
  }
}

class FakeDriver implements IOSDeviceDriver {
  constructor(private readonly healthy: () => boolean) {}
  async status() { if (!this.healthy()) throw new Error('offline'); return { ok: true }; }
  async createSession() { return 'session-1'; }
  async deleteSession() {}
  async screenshot() { return 'base64'; }
  async source() { return '<xml />'; }
  async tap() {}
  async activateApp() {}
}

test('reconcile discovers and registers a physical iOS device', async () => {
  const registry = new DeviceRegistry();
  const runtime = new DeviceRuntimeManager(new FakeDiscovery(), registry, () => new FakeDriver(() => true));
  const devices = await runtime.reconcile();
  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.health, 'online');
  assert.equal(devices[0]?.appiumPort, 4723);
  assert.equal(devices[0]?.wdaPort, 8100);
});

test('heartbeat quarantines repeatedly failing devices', async () => {
  const registry = new DeviceRegistry();
  const runtime = new DeviceRuntimeManager(new FakeDiscovery(), registry, () => new FakeDriver(() => false), { failureThreshold: 2 });
  await runtime.reconcile();
  await runtime.heartbeatOnce();
  await runtime.heartbeatOnce();
  assert.equal(registry.list()[0]?.health, 'quarantined');
});

test('recover returns quarantined device to service when health is restored', async () => {
  const registry = new DeviceRegistry();
  let healthy = false;
  const runtime = new DeviceRuntimeManager(new FakeDiscovery(), registry, (_device: DeviceTwin) => new FakeDriver(() => healthy), { failureThreshold: 1 });
  await runtime.reconcile();
  await runtime.heartbeatOnce();
  assert.equal(registry.list()[0]?.health, 'quarantined');
  healthy = true;
  assert.equal(await runtime.recover('00008110-001234567890801E'), true);
  assert.equal(registry.list()[0]?.health, 'online');
});
