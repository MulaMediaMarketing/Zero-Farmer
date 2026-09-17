import type { DistributedLeaseManager, DurableQueue, QueueEnvelope } from '../infrastructure/coordination.js';

export interface FleetJob {
  runId: string;
  deviceId: string;
}

export interface FleetJobExecutor {
  execute(runId: string): Promise<void>;
}

export class FleetWorker {
  private stopped = false;

  constructor(
    private readonly queue: DurableQueue<FleetJob>,
    private readonly leases: DistributedLeaseManager,
    private readonly executor: FleetJobExecutor,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async runOnce(timeoutSeconds = 1): Promise<boolean> {
    const envelope = await this.queue.next(timeoutSeconds);
    if (!envelope) return false;
    await this.handle(envelope);
    return true;
  }

  async runForever(): Promise<void> {
    while (!this.stopped) await this.runOnce(5);
  }

  private async handle(envelope: QueueEnvelope<FleetJob>): Promise<void> {
    const lease = await this.leases.acquire(`device:${envelope.payload.deviceId}`, 120_000);
    if (!lease) {
      await this.queue.enqueue(envelope.payload);
      return;
    }

    try {
      await this.executor.execute(envelope.payload.runId);
    } finally {
      await this.leases.release(lease);
    }
  }
}
