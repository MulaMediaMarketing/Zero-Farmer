import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target?: string;
  outcome: 'success' | 'denied' | 'failure';
  metadata?: Record<string, unknown>;
}

export class AuditLog {
  private readonly events: AuditEvent[] = [];
  constructor(private readonly maxEntries = 10_000) {}

  record(event: Omit<AuditEvent, 'id' | 'at'>): AuditEvent {
    const full: AuditEvent = { id: randomUUID(), at: new Date().toISOString(), ...event };
    this.events.push(full);
    if (this.events.length > this.maxEntries) this.events.splice(0, this.events.length - this.maxEntries);
    return full;
  }

  list(limit = 200): AuditEvent[] {
    return this.events.slice(-Math.max(1, Math.min(limit, 1000))).reverse();
  }
}

export class MetricRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  inc(name: string, value = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + value); }
  set(name: string, value: number): void { this.gauges.set(name, value); }

  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.counters, ...this.gauges]);
  }

  prometheus(): string {
    const rows: string[] = [];
    for (const [name, value] of [...this.counters, ...this.gauges]) {
      const safe = name.replace(/[^a-zA-Z0-9_:]/g, '_');
      rows.push(`# TYPE ${safe} gauge`, `${safe} ${value}`);
    }
    return `${rows.join('\n')}\n`;
  }
}

export interface ControlPlaneEvent {
  id: string;
  at: string;
  type: string;
  payload?: Record<string, unknown>;
}

export class ControlPlaneEventBus {
  private readonly emitter = new EventEmitter();

  publish(type: string, payload?: Record<string, unknown>): ControlPlaneEvent {
    const event: ControlPlaneEvent = { id: randomUUID(), at: new Date().toISOString(), type, payload };
    this.emitter.emit('event', event);
    return event;
  }

  subscribe(listener: (event: ControlPlaneEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
