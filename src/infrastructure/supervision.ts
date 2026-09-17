import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type ManagedProcessState = 'stopped' | 'starting' | 'running' | 'backoff' | 'failed';

export interface ManagedProcessSpec {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  restart?: 'never' | 'on-failure' | 'always';
  maxRestarts?: number;
  backoffMs?: number;
}

export interface ManagedProcessSnapshot {
  id: string;
  state: ManagedProcessState;
  pid?: number;
  restarts: number;
  lastExitCode?: number | null;
  lastError?: string;
  startedAt?: string;
}

export class ProcessSupervisor {
  private readonly processes = new Map<string, { spec: ManagedProcessSpec; child?: ChildProcessWithoutNullStreams; snapshot: ManagedProcessSnapshot }>();

  register(spec: ManagedProcessSpec): void {
    if (this.processes.has(spec.id)) throw new Error(`Process ${spec.id} already registered`);
    this.processes.set(spec.id, { spec, snapshot: { id: spec.id, state: 'stopped', restarts: 0 } });
  }

  list(): ManagedProcessSnapshot[] {
    return [...this.processes.values()].map(({ snapshot }) => ({ ...snapshot }));
  }

  get(id: string): ManagedProcessSnapshot | undefined {
    const item = this.processes.get(id);
    return item ? { ...item.snapshot } : undefined;
  }

  async start(id: string): Promise<void> {
    const item = this.processes.get(id);
    if (!item) throw new Error(`Unknown process ${id}`);
    if (item.child && !item.child.killed) return;

    item.snapshot.state = 'starting';
    const child = spawn(item.spec.command, item.spec.args ?? [], {
      cwd: item.spec.cwd,
      env: { ...process.env, ...item.spec.env },
      stdio: 'pipe',
    });
    item.child = child;
    item.snapshot.pid = child.pid;
    item.snapshot.startedAt = new Date().toISOString();
    item.snapshot.state = 'running';

    child.on('error', (error) => {
      item.snapshot.lastError = error.message;
      item.snapshot.state = 'failed';
    });

    child.on('exit', (code) => {
      item.snapshot.lastExitCode = code;
      item.snapshot.pid = undefined;
      item.child = undefined;
      const shouldRestart = item.spec.restart === 'always' || (item.spec.restart === 'on-failure' && code !== 0);
      const maxRestarts = item.spec.maxRestarts ?? 5;
      if (!shouldRestart || item.snapshot.restarts >= maxRestarts) {
        item.snapshot.state = code === 0 ? 'stopped' : 'failed';
        return;
      }
      item.snapshot.restarts += 1;
      item.snapshot.state = 'backoff';
      const delay = (item.spec.backoffMs ?? 1000) * item.snapshot.restarts;
      setTimeout(() => { void this.start(id); }, delay).unref();
    });
  }

  async stop(id: string): Promise<void> {
    const item = this.processes.get(id);
    if (!item) throw new Error(`Unknown process ${id}`);
    if (!item.child) {
      item.snapshot.state = 'stopped';
      return;
    }
    item.spec.restart = 'never';
    item.child.kill('SIGTERM');
  }
}

export function registerDefaultIosServices(supervisor: ProcessSupervisor): void {
  supervisor.register({
    id: 'appium',
    command: 'appium',
    args: ['--base-path', '/wd/hub'],
    restart: 'always',
    maxRestarts: 20,
    backoffMs: 1000,
  });
  supervisor.register({
    id: 'wda-supervisor',
    command: process.execPath,
    args: ['dist/workers/wda-supervisor.js'],
    restart: 'always',
    maxRestarts: 20,
    backoffMs: 1500,
  });
}
