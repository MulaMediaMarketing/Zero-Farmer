import type { DeviceTwin, WorkflowDefinition, WorkflowRun } from '../types.js';

export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface DurableRunRepository {
  saveDevice(device: DeviceTwin): Promise<void>;
  listDevices(): Promise<DeviceTwin[]>;
  saveWorkflow(workflow: WorkflowDefinition): Promise<void>;
  getWorkflow(id: string, version?: number): Promise<WorkflowDefinition | undefined>;
  saveRun(run: WorkflowRun): Promise<void>;
  getRun(id: string): Promise<WorkflowRun | undefined>;
  listRuns(): Promise<WorkflowRun[]>;
}

export class PostgresRepository implements DurableRunRepository {
  constructor(private readonly db: SqlExecutor) {}

  async saveDevice(device: DeviceTwin): Promise<void> {
    await this.db.query(
      `INSERT INTO devices (id, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [device.id, JSON.stringify(device)],
    );
  }

  async listDevices(): Promise<DeviceTwin[]> {
    const result = await this.db.query<{ payload: DeviceTwin }>('SELECT payload FROM devices ORDER BY id');
    return result.rows.map((row) => row.payload);
  }

  async saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
    await this.db.query(
      `INSERT INTO workflows (id, version, payload, created_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (id, version) DO UPDATE SET payload = EXCLUDED.payload`,
      [workflow.id, workflow.version, JSON.stringify(workflow)],
    );
  }

  async getWorkflow(id: string, version?: number): Promise<WorkflowDefinition | undefined> {
    const sql = version
      ? 'SELECT payload FROM workflows WHERE id = $1 AND version = $2 LIMIT 1'
      : 'SELECT payload FROM workflows WHERE id = $1 ORDER BY version DESC LIMIT 1';
    const result = await this.db.query<{ payload: WorkflowDefinition }>(sql, version ? [id, version] : [id]);
    return result.rows[0]?.payload;
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_runs (id, status, payload, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = now()`,
      [run.id, run.status, JSON.stringify(run)],
    );
  }

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    const result = await this.db.query<{ payload: WorkflowRun }>('SELECT payload FROM workflow_runs WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0]?.payload;
  }

  async listRuns(): Promise<WorkflowRun[]> {
    const result = await this.db.query<{ payload: WorkflowRun }>('SELECT payload FROM workflow_runs ORDER BY updated_at DESC');
    return result.rows.map((row) => row.payload);
  }
}
