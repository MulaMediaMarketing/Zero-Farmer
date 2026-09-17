import { EventEmitter } from 'node:events';
import type { DeviceTwin } from './types.js';
import type { DeviceSessionRuntime } from './device-runtime.js';

export interface ScreenFrame {
  deviceId: string;
  capturedAt: string;
  base64Png: string;
}

export class ScreenFrameStream {
  private readonly emitter = new EventEmitter();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly sessions: DeviceSessionRuntime, private readonly intervalMs = 750) {}

  start(device: DeviceTwin): void {
    if (this.timers.has(device.id)) return;
    const capture = async () => {
      try {
        const base64Png = await this.sessions.screenshot(device);
        const frame: ScreenFrame = { deviceId: device.id, capturedAt: new Date().toISOString(), base64Png };
        this.emitter.emit(device.id, frame);
      } catch (error) {
        this.emitter.emit(`${device.id}:error`, error);
      }
    };
    void capture();
    const timer = setInterval(() => void capture(), this.intervalMs);
    timer.unref?.();
    this.timers.set(device.id, timer);
  }

  stop(deviceId: string): void {
    const timer = this.timers.get(deviceId);
    if (timer) clearInterval(timer);
    this.timers.delete(deviceId);
  }

  subscribe(deviceId: string, listener: (frame: ScreenFrame) => void): () => void {
    this.emitter.on(deviceId, listener);
    return () => this.emitter.off(deviceId, listener);
  }

  subscribeErrors(deviceId: string, listener: (error: unknown) => void): () => void {
    const event = `${deviceId}:error`;
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  close(): void {
    for (const id of [...this.timers.keys()]) this.stop(id);
    this.emitter.removeAllListeners();
  }
}
