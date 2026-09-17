import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntime, createServer } from '../src/app.js';

test('control plane exposes liveness and prometheus metrics', async () => {
  const { app } = createServer(createRuntime());
  const live = await app.inject({ method: 'GET', url: '/livez' });
  assert.equal(live.statusCode, 200);
  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /zero_farmer_devices_total/);
  await app.close();
});

test('device quarantine and restore routes update fleet state', async () => {
  const runtime = createRuntime();
  runtime.devices.upsert({ id: 'd1', name: 'Phone 1', udid: 'u1', health: 'online', tags: [] });
  const { app } = createServer(runtime);
  const quarantine = await app.inject({ method: 'POST', url: '/api/v1/devices/d1/quarantine' });
  assert.equal(quarantine.statusCode, 200);
  assert.equal(runtime.devices.get('d1')?.health, 'quarantined');
  const restore = await app.inject({ method: 'POST', url: '/api/v1/devices/d1/restore' });
  assert.equal(restore.statusCode, 200);
  assert.equal(runtime.devices.get('d1')?.health, 'online');
  await app.close();
});
