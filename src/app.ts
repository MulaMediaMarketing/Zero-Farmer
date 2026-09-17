import Fastify from 'fastify';
import { z } from 'zod';
import { RuleWorkflowCompiler } from './intelligence.js';
import {
  AgentMemory,
  AgentOrchestrator,
  DeviceRegistry,
  FleetIntelligence,
  NaturalLanguageWorkflowService,
  PluginRegistry,
  RecoveryEngine,
  ReplayLog,
  WorkflowStore,
} from './platform.js';
import type { AgentPlugin, DeviceTwin } from './types.js';

export interface ZeroFarmerRuntime {
  devices: DeviceRegistry;
  memory: AgentMemory;
  replay: ReplayLog;
  plugins: PluginRegistry;
  workflows: WorkflowStore;
  recovery: RecoveryEngine;
  orchestrator: AgentOrchestrator;
  fleet: FleetIntelligence;
  naturalLanguage: NaturalLanguageWorkflowService;
}

export function createRuntime(): ZeroFarmerRuntime {
  const devices = new DeviceRegistry();
  const memory = new AgentMemory();
  const replay = new ReplayLog();
  const plugins = new PluginRegistry();
  const workflows = new WorkflowStore();
  const recovery = new RecoveryEngine();
  const orchestrator = new AgentOrchestrator(devices, workflows, plugins, memory, replay, recovery);
  const fleet = new FleetIntelligence(devices, () => orchestrator.listRuns());
  const naturalLanguage = new NaturalLanguageWorkflowService(new RuleWorkflowCompiler(), workflows);

  recovery.register({
    id: 'mark-degraded',
    description: 'Mark a device degraded so the scheduler stops selecting it until an operator recovers it.',
    async execute(device) { device.health = 'degraded'; return false; },
  });

  const corePlugin: AgentPlugin = {
    id: 'core',
    name: 'ZERO Farmer Core',
    version: '0.1.0',
    capabilities: ['memory', 'delay', 'device-state'],
    actions: {
      async delay(_ctx, input) {
        const ms = z.number().int().min(0).max(60_000).parse(input.ms ?? 250);
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { waitedMs: ms };
      },
      async remember(ctx, input) {
        const parsed = z.object({ namespace: z.string(), key: z.string(), value: z.unknown(), accountKey: z.string().optional() }).parse(input);
        await ctx.memory.set({ deviceId: ctx.device.id, ...parsed });
        return { stored: true };
      },
      async assertOnline(ctx) {
        if (ctx.device.health !== 'busy' && ctx.device.health !== 'online') throw new Error(`Device is ${ctx.device.health}`);
        return { ok: true };
      },
    },
  };
  plugins.register(corePlugin);

  return { devices, memory, replay, plugins, workflows, recovery, orchestrator, fleet, naturalLanguage };
}

export function createServer(runtime = createRuntime()) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ ok: true, service: 'zero-farmer' }));
  app.get('/api/v1/fleet', async () => runtime.fleet.snapshot());
  app.get('/api/v1/devices', async () => runtime.devices.list());
  app.get('/api/v1/plugins', async () => runtime.plugins.list());
  app.get('/api/v1/workflows', async () => runtime.workflows.list());
  app.get('/api/v1/runs', async () => runtime.orchestrator.listRuns());
  app.get('/api/v1/recovery-actions', async () => runtime.recovery.list());

  app.post('/api/v1/devices', async (request, reply) => {
    const body = z.object({
      id: z.string().min(1), name: z.string().min(1), udid: z.string().min(1),
      iosVersion: z.string().optional(), appiumPort: z.number().int().optional(), wdaPort: z.number().int().optional(),
      battery: z.number().min(0).max(100).optional(), temperatureC: z.number().optional(), storageFreeMb: z.number().optional(),
      network: z.enum(['wifi', 'cellular', 'offline', 'unknown']).optional(), currentApp: z.string().optional(),
      health: z.enum(['online', 'busy', 'degraded', 'offline', 'quarantined']).default('online'), tags: z.array(z.string()).default([]),
    }).parse(request.body);
    const twin: DeviceTwin = runtime.devices.upsert(body);
    return reply.code(201).send(twin);
  });

  app.post('/api/v1/workflows', async (request, reply) => {
    const body = z.object({
      id: z.string().optional(), name: z.string().min(1), pluginId: z.string().optional(),
      deviceSelector: z.object({ tags: z.array(z.string()).optional(), ids: z.array(z.string()).optional() }).optional(),
      steps: z.array(z.object({
        id: z.string().min(1), action: z.string().min(1), input: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().positive().optional(),
        retry: z.object({ attempts: z.number().int().min(1).max(10), backoffMs: z.number().int().min(0).max(60_000) }).optional(),
        recoveryPolicy: z.string().optional(),
      })).min(1),
    }).parse(request.body);
    return reply.code(201).send(runtime.workflows.save(body));
  });

  app.post('/api/v1/workflows/compile', async (request, reply) => {
    const { prompt } = z.object({ prompt: z.string().min(1).max(4000) }).parse(request.body);
    return reply.code(201).send(await runtime.naturalLanguage.create(prompt));
  });

  app.post('/api/v1/workflows/:id/runs', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ version: z.number().int().positive().optional(), executeNow: z.boolean().default(true) }).parse(request.body ?? {});
    const run = runtime.orchestrator.enqueue(params.id, body.version);
    if (body.executeNow) await runtime.orchestrator.execute(run.id);
    return reply.code(201).send(runtime.orchestrator.getRun(run.id));
  });

  app.get('/api/v1/runs/:id/replay', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const run = runtime.orchestrator.getRun(id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    return { run, events: runtime.replay.forRun(id) };
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: error.issues });
    app.log.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return reply.code(500).send({ error: message });
  });

  return { app, runtime };
}
