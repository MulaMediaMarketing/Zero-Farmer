import { randomUUID } from 'node:crypto';
import type {
  AgentMemoryRecord,
  AgentPlugin,
  DeviceTwin,
  RecoveryAction,
  RunEvent,
  ScreenObservation,
  VisionPort,
  WorkflowCompilerPort,
  WorkflowDefinition,
  WorkflowRun,
} from './types.js';

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceTwin>();

  upsert(input: Omit<DeviceTwin, 'lastSeenAt' | 'failureCount'> & Partial<Pick<DeviceTwin, 'lastSeenAt' | 'failureCount'>>): DeviceTwin {
    const previous = this.devices.get(input.id);
    const next: DeviceTwin = {
      ...previous,
      ...input,
      lastSeenAt: input.lastSeenAt ?? new Date().toISOString(),
      failureCount: input.failureCount ?? previous?.failureCount ?? 0,
    };
    this.devices.set(next.id, next);
    return next;
  }

  get(id: string): DeviceTwin | undefined { return this.devices.get(id); }
  list(): DeviceTwin[] { return [...this.devices.values()]; }

  select(selector?: WorkflowDefinition['deviceSelector']): DeviceTwin | undefined {
    return this.list()
      .filter((d) => d.health === 'online')
      .filter((d) => !selector?.ids || selector.ids.includes(d.id))
      .filter((d) => !selector?.tags || selector.tags.every((tag) => d.tags.includes(tag)))
      .sort((a, b) => a.failureCount - b.failureCount)[0];
  }
}

export class AgentMemory {
  private readonly records = new Map<string, AgentMemoryRecord>();
  private keyOf(deviceId: string, namespace: string, key: string, accountKey?: string) {
    return [deviceId, accountKey ?? '-', namespace, key].join(':');
  }
  async get(deviceId: string, namespace: string, key: string, accountKey?: string): Promise<unknown> {
    return this.records.get(this.keyOf(deviceId, namespace, key, accountKey))?.value;
  }
  async set(record: Omit<AgentMemoryRecord, 'updatedAt'>): Promise<void> {
    this.records.set(this.keyOf(record.deviceId, record.namespace, record.key, record.accountKey), {
      ...record,
      updatedAt: new Date().toISOString(),
    });
  }
  list(): AgentMemoryRecord[] { return [...this.records.values()]; }
}

export class ReplayLog {
  private readonly events: RunEvent[] = [];
  emit(runId: string, type: string, payload?: Record<string, unknown>, stepId?: string): RunEvent {
    const event: RunEvent = { id: randomUUID(), runId, at: new Date().toISOString(), type, stepId, payload };
    this.events.push(event);
    return event;
  }
  forRun(runId: string): RunEvent[] { return this.events.filter((event) => event.runId === runId); }
}

export class PluginRegistry {
  private readonly plugins = new Map<string, AgentPlugin>();
  register(plugin: AgentPlugin) {
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin already registered: ${plugin.id}`);
    this.plugins.set(plugin.id, plugin);
  }
  get(id: string): AgentPlugin | undefined { return this.plugins.get(id); }
  list(): Array<Omit<AgentPlugin, 'actions'>> {
    return [...this.plugins.values()].map(({ actions: _actions, ...plugin }) => plugin);
  }
}

export class WorkflowStore {
  private readonly versions = new Map<string, WorkflowDefinition[]>();
  save(input: Omit<WorkflowDefinition, 'id' | 'version' | 'createdAt'> & { id?: string }): WorkflowDefinition {
    const id = input.id ?? randomUUID();
    const previous = this.versions.get(id) ?? [];
    const workflow: WorkflowDefinition = {
      ...input,
      id,
      version: previous.length + 1,
      createdAt: new Date().toISOString(),
    };
    this.versions.set(id, [...previous, workflow]);
    return workflow;
  }
  get(id: string, version?: number): WorkflowDefinition | undefined {
    const all = this.versions.get(id) ?? [];
    return version ? all.find((item) => item.version === version) : all.at(-1);
  }
  list(): WorkflowDefinition[] { return [...this.versions.values()].flatMap((items) => items.at(-1) ?? []); }
}

export class RecoveryEngine {
  private readonly actions = new Map<string, RecoveryAction>();
  register(action: RecoveryAction) { this.actions.set(action.id, action); }
  async execute(policy: string | undefined, device: DeviceTwin): Promise<boolean> {
    if (!policy) return false;
    return (await this.actions.get(policy)?.execute(device)) ?? false;
  }
  list() { return [...this.actions.values()].map(({ execute: _execute, ...action }) => action); }
}

export class SelfHealingResolver {
  constructor(private readonly vision?: VisionPort) {}
  async heal(device: DeviceTwin, intent: string, prior?: ScreenObservation) {
    if (!this.vision) return undefined;
    const observation = prior ?? await this.vision.observe(device);
    return this.vision.resolveTarget(observation, intent);
  }
}

export class FleetIntelligence {
  constructor(private readonly devices: DeviceRegistry, private readonly runs: () => WorkflowRun[]) {}
  snapshot() {
    const devices = this.devices.list();
    const runs = this.runs();
    const completed = runs.filter((r) => r.status === 'succeeded' || r.status === 'failed');
    return {
      devices: {
        total: devices.length,
        online: devices.filter((d) => d.health === 'online').length,
        busy: devices.filter((d) => d.health === 'busy').length,
        degraded: devices.filter((d) => d.health === 'degraded').length,
        quarantined: devices.filter((d) => d.health === 'quarantined').length,
      },
      runs: {
        total: runs.length,
        queued: runs.filter((r) => r.status === 'queued').length,
        running: runs.filter((r) => r.status === 'running').length,
        succeeded: runs.filter((r) => r.status === 'succeeded').length,
        failed: runs.filter((r) => r.status === 'failed').length,
        successRate: completed.length ? completed.filter((r) => r.status === 'succeeded').length / completed.length : 0,
      },
    };
  }
}

export class AgentOrchestrator {
  private readonly runs = new Map<string, WorkflowRun>();

  constructor(
    private readonly devices: DeviceRegistry,
    private readonly workflows: WorkflowStore,
    private readonly plugins: PluginRegistry,
    private readonly memory: AgentMemory,
    private readonly replay: ReplayLog,
    private readonly recovery: RecoveryEngine,
  ) {}

  listRuns(): WorkflowRun[] { return [...this.runs.values()]; }
  getRun(id: string): WorkflowRun | undefined { return this.runs.get(id); }

  enqueue(workflowId: string, version?: number): WorkflowRun {
    const workflow = this.workflows.get(workflowId, version);
    if (!workflow) throw new Error('Workflow not found');
    const run: WorkflowRun = {
      id: randomUUID(), workflowId, workflowVersion: workflow.version,
      status: 'queued', createdAt: new Date().toISOString(),
    };
    this.runs.set(run.id, run);
    this.replay.emit(run.id, 'run.queued', { workflowId, version: workflow.version });
    return run;
  }

  async execute(runId: string): Promise<WorkflowRun> {
    const run = this.runs.get(runId);
    if (!run) throw new Error('Run not found');
    const workflow = this.workflows.get(run.workflowId, run.workflowVersion);
    if (!workflow) throw new Error('Workflow version not found');
    const device = this.devices.select(workflow.deviceSelector);
    if (!device) throw new Error('No eligible online device');

    run.deviceId = device.id;
    run.status = 'running'; run.startedAt = new Date().toISOString();
    device.health = 'busy'; device.activeRunId = run.id;
    this.replay.emit(run.id, 'run.started', { deviceId: device.id });

    try {
      for (const step of workflow.steps) {
        this.replay.emit(run.id, 'step.started', { action: step.action }, step.id);
        const [pluginId, actionName] = step.action.includes('.') ? step.action.split('.', 2) : [workflow.pluginId, step.action];
        if (!pluginId) throw new Error(`No plugin resolved for action ${step.action}`);
        const plugin = this.plugins.get(pluginId);
        const action = plugin?.actions[actionName];
        if (!plugin || !action) throw new Error(`Unknown action: ${pluginId}.${actionName}`);

        const attempts = Math.max(1, step.retry?.attempts ?? 1);
        let lastError: unknown;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const result = await action({
              run,
              device,
              memory: this.memory,
              emit: (type, payload) => { this.replay.emit(run.id, type, payload, step.id); },
            }, step.input ?? {});
            this.replay.emit(run.id, 'step.succeeded', { result }, step.id);
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            this.replay.emit(run.id, 'step.failed', { attempt, error: String(error) }, step.id);
            if (attempt < attempts && step.retry?.backoffMs) await new Promise((r) => setTimeout(r, step.retry!.backoffMs));
          }
        }
        if (lastError) {
          const recovered = await this.recovery.execute(step.recoveryPolicy, device);
          this.replay.emit(run.id, 'recovery.completed', { policy: step.recoveryPolicy, recovered }, step.id);
          if (!recovered) throw lastError;
        }
      }
      run.status = 'succeeded'; run.finishedAt = new Date().toISOString();
      this.replay.emit(run.id, 'run.succeeded');
    } catch (error) {
      run.status = 'failed'; run.finishedAt = new Date().toISOString(); run.error = String(error);
      device.failureCount += 1;
      if (device.failureCount >= 3) device.health = 'quarantined';
      this.replay.emit(run.id, 'run.failed', { error: run.error });
    } finally {
      if (device.health === 'busy') device.health = 'online';
      device.activeRunId = undefined;
      device.lastSeenAt = new Date().toISOString();
    }
    return run;
  }
}

export class NaturalLanguageWorkflowService {
  constructor(private readonly compiler: WorkflowCompilerPort | undefined, private readonly store: WorkflowStore) {}
  async create(prompt: string) {
    if (!this.compiler) throw new Error('No workflow compiler configured');
    return this.store.save(await this.compiler.compile(prompt));
  }
}
