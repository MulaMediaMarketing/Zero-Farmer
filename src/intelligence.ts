import type { ScreenObservation, VisualElement, VisionPort, WorkflowCompilerPort } from './types.js';

function scoreElement(element: VisualElement, intent: string): number {
  const query = intent.trim().toLowerCase();
  const text = `${element.text ?? ''} ${element.role ?? ''} ${element.id}`.toLowerCase();
  if (!query) return element.confidence;
  const tokens = query.split(/\s+/).filter((token) => token.length > 1);
  const matches = tokens.filter((token) => text.includes(token)).length;
  const lexical = tokens.length ? matches / tokens.length : 0;
  return lexical * 0.75 + element.confidence * 0.25;
}

export class ObservationVisionResolver implements VisionPort {
  constructor(private readonly capture: (deviceId: string) => Promise<ScreenObservation>) {}
  async observe(device: { id: string }): Promise<ScreenObservation> { return this.capture(device.id); }
  async resolveTarget(observation: ScreenObservation, intent: string): Promise<VisualElement | undefined> {
    return [...observation.elements]
      .map((element) => ({ element, score: scoreElement(element, intent) }))
      .filter((candidate) => candidate.score >= 0.45)
      .sort((a, b) => b.score - a.score)[0]?.element;
  }
}

export class RuleWorkflowCompiler implements WorkflowCompilerPort {
  async compile(prompt: string) {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Workflow prompt cannot be empty');

    const steps = normalized
      .split(/(?:\bthen\b|,|\band then\b)/i)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((instruction, index) => ({
        id: `step-${index + 1}`,
        action: 'core.remember',
        input: {
          namespace: 'compiled-intent',
          key: `step-${index + 1}`,
          value: instruction,
        },
        retry: { attempts: 2, backoffMs: 250 },
        recoveryPolicy: 'mark-degraded',
      }));

    return {
      name: normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized,
      pluginId: 'core',
      steps,
    };
  }
}
