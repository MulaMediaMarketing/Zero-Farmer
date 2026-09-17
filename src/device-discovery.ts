import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DiscoveredIOSDevice {
  name: string;
  udid: string;
  iosVersion?: string;
  connected: boolean;
}

export interface DeviceDiscoveryPort {
  discover(): Promise<DiscoveredIOSDevice[]>;
}

export class XcodeDeviceDiscovery implements DeviceDiscoveryPort {
  async discover(): Promise<DiscoveredIOSDevice[]> {
    if (process.platform !== 'darwin') return [];
    const { stdout } = await execFileAsync('xcrun', ['xctrace', 'list', 'devices']);
    return parseXctraceDevices(stdout);
  }
}

export function parseXctraceDevices(output: string): DiscoveredIOSDevice[] {
  const devices: DiscoveredIOSDevice[] = [];
  let inDevices = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '== Devices ==') { inDevices = true; continue; }
    if (line.startsWith('==') && line !== '== Devices ==') { if (inDevices) break; continue; }
    if (!inDevices || !line || line.includes('Simulator')) continue;
    const match = line.match(/^(.*?)\s+\(([^)]+)\)\s+\(([0-9A-Fa-f-]{20,})\)$/);
    if (!match) continue;
    const [, name = '', version = '', udid = ''] = match;
    devices.push({ name: name.trim(), iosVersion: version.trim(), udid: udid.trim(), connected: true });
  }
  return devices;
}
