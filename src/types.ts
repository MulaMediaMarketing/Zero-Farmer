export type DeviceHealth = 'online' | 'busy' | 'degraded' | 'offline' | 'quarantined';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface DeviceTwin {
  id: string;
  name: string;
  udid: string;
  iosVersion?: string;
  appiumPort?: number;
  wdaPort?: number;
  battery?: number;
  temperatureC?: number;
  storageFreeMb?: number;
  network?: 'wifi' | 'cellular' | 'offline' | 'unknown';
  currentApp?: string;
  health: DeviceHealth;
  tags: string[];
  activeRunId?: string;
  lastSeenAt: string;
  failureCount: number;
}

export interface VisualElement {
  id: string;
  role?: string;
  text?: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
  selector?: string;
}

export interface ScreenObservation {
  deviceId: string;
  screenshotRef: string;
  capturedAt: string;
  elements: VisualElement[];
  ocrText?: string;
  appState?: string;
}

export interface AgentMemoryRecord {
  deviceId: string;
  accountKey?: string;
  namespace: string;
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  action: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
  retry?: { attempts: number; backoffMs: number };
  recoveryPolicy?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  pluginId?: string;
  deviceSelector?: { tags?: string[]; ids?: string[] };
  steps: WorkflowStep[];
  createdAt: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  at: string;
  type: string;
  stepId?: string;
  payload?: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowVersion: number;
  deviceId?: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface RecoveryAction {
  id: string;
  description: string;
  execute(device: DeviceTwin): Promise<boolean>;
}

export interface AgentPlugin {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  actions: Record<string, (ctx: AgentActionContext, input: Record<string, unknown>) => Promise<unknown>>;
  healthCheck?: () => Promise<{ ok: boolean; detail?: string }>;
}

export interface AgentActionContext {
  run: WorkflowRun;
  device: DeviceTwin;
  memory: MemoryPort;
  emit(type: string, payload?: Record<string, unknown>): void;
}

export interface MemoryPort {
  get(deviceId: string, namespace: string, key: string, accountKey?: string): Promise<unknown>;
  set(record: Omit<AgentMemoryRecord, 'updatedAt'>): Promise<void>;
}

export interface VisionPort {
  observe(device: DeviceTwin): Promise<ScreenObservation>;
  resolveTarget(observation: ScreenObservation, intent: string): Promise<VisualElement | undefined>;
}

export interface WorkflowCompilerPort {
  compile(prompt: string): Promise<Omit<WorkflowDefinition, 'id' | 'version' | 'createdAt'>>;
}
