export interface TapPoint { x: number; y: number }

export interface IOSDeviceDriver {
  status(): Promise<unknown>;
  createSession(capabilities: Record<string, unknown>): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
  screenshot(sessionId: string): Promise<string>;
  source(sessionId: string): Promise<string>;
  tap(sessionId: string, point: TapPoint): Promise<void>;
  activateApp(sessionId: string, bundleId: string): Promise<void>;
}

export class AppiumIOSDriver implements IOSDeviceDriver {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, init?: RequestInit): Promise<any> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Appium ${response.status}: ${JSON.stringify(body)}`);
    return body?.value ?? body;
  }

  status() { return this.request('/status'); }

  async createSession(capabilities: Record<string, unknown>): Promise<string> {
    const value = await this.request('/session', {
      method: 'POST',
      body: JSON.stringify({ capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }),
    });
    const sessionId = value?.sessionId ?? value?.capabilities?.sessionId;
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Appium did not return a session id');
    return sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  }

  async screenshot(sessionId: string): Promise<string> {
    return String(await this.request(`/session/${encodeURIComponent(sessionId)}/screenshot`));
  }

  async source(sessionId: string): Promise<string> {
    return String(await this.request(`/session/${encodeURIComponent(sessionId)}/source`));
  }

  async tap(sessionId: string, point: TapPoint): Promise<void> {
    await this.request(`/session/${encodeURIComponent(sessionId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ actions: [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: [
        { type: 'pointerMove', duration: 0, x: point.x, y: point.y, origin: 'viewport' },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 80 },
        { type: 'pointerUp', button: 0 },
      ] }] }),
    });
  }

  async activateApp(sessionId: string, bundleId: string): Promise<void> {
    await this.request(`/session/${encodeURIComponent(sessionId)}/appium/device/activate_app`, {
      method: 'POST', body: JSON.stringify({ appId: bundleId }),
    });
  }
}
