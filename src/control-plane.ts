import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZeroFarmerRuntime } from './app.js';
import { AuditLog, ControlPlaneEventBus, MetricRegistry } from './observability.js';

export interface ControlPlaneOptions {
  apiKeys?: string[];
  requestsPerMinute?: number;
}

interface Bucket { count: number; resetAt: number }

export function registerControlPlane(app: FastifyInstance, runtime: ZeroFarmerRuntime, options: ControlPlaneOptions = {}) {
  const audit = new AuditLog();
  const metrics = new MetricRegistry();
  const events = new ControlPlaneEventBus();
  const buckets = new Map<string, Bucket>();
  const rpm = options.requestsPerMinute ?? 600;
  const configuredKeys = new Set((options.apiKeys ?? []).filter(Boolean));

  const actorFor = (request: FastifyRequest): string => {
    const header = request.headers['x-api-key'];
    if (typeof header === 'string' && header.length > 0) return `api:${header.slice(0, 6)}`;
    return request.ip;
  };

  app.addHook('onRequest', async (request, reply) => {
    const now = Date.now();
    const key = request.ip;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + 60_000 });
    else {
      bucket.count += 1;
      if (bucket.count > rpm) {
        metrics.inc('zero_farmer_rate_limit_denied_total');
        audit.record({ actor: actorFor(request), action: 'request', target: request.url, outcome: 'denied', metadata: { reason: 'rate-limit' } });
        return reply.code(429).send({ error: 'Rate limit exceeded' });
      }
    }

    if (configuredKeys.size > 0 && request.url.startsWith('/api/')) {
      const header = request.headers['x-api-key'];
      if (typeof header !== 'string' || !configuredKeys.has(header)) {
        metrics.inc('zero_farmer_auth_denied_total');
        audit.record({ actor: actorFor(request), action: 'authenticate', target: request.url, outcome: 'denied' });
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    }
    metrics.inc('zero_farmer_http_requests_total');
  });

  app.get('/livez', async () => ({ ok: true, service: 'zero-farmer' }));
  app.get('/readyz', async (_request, reply) => {
    const snapshot = runtime.fleet.snapshot();
    const ready = snapshot.devices.total >= 0;
    return reply.code(ready ? 200 : 503).send({ ok: ready, fleet: snapshot.devices });
  });

  app.get('/metrics', async (_request, reply) => {
    const fleet = runtime.fleet.snapshot();
    metrics.set('zero_farmer_devices_total', fleet.devices.total);
    metrics.set('zero_farmer_devices_online', fleet.devices.online);
    metrics.set('zero_farmer_devices_busy', fleet.devices.busy);
    metrics.set('zero_farmer_devices_offline', fleet.devices.offline);
    metrics.set('zero_farmer_runs_total', fleet.runs.total);
    metrics.set('zero_farmer_runs_failed', fleet.runs.failed);
    reply.type('text/plain; version=0.0.4');
    return metrics.prometheus();
  });

  app.get('/api/v1/audit', async (request) => {
    const limit = Number((request.query as Record<string, string | undefined>).limit ?? 200);
    return audit.list(Number.isFinite(limit) ? limit : 200);
  });

  app.post('/api/v1/devices/:id/quarantine', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const device = runtime.devices.get(id);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    device.health = 'quarantined';
    const actor = actorFor(request);
    audit.record({ actor, action: 'device.quarantine', target: id, outcome: 'success' });
    events.publish('device.quarantined', { deviceId: id, actor });
    metrics.inc('zero_farmer_device_quarantine_total');
    return device;
  });

  app.post('/api/v1/devices/:id/restore', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const device = runtime.devices.get(id);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    device.health = 'online';
    device.failureCount = 0;
    device.lastSeenAt = new Date().toISOString();
    const actor = actorFor(request);
    audit.record({ actor, action: 'device.restore', target: id, outcome: 'success' });
    events.publish('device.restored', { deviceId: id, actor });
    metrics.inc('zero_farmer_device_restore_total');
    return device;
  });

  return { audit, metrics, events };
}
