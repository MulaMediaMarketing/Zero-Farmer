import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/app.js';
import { ObservationVisionResolver, RuleWorkflowCompiler } from '../src/intelligence.js';

test('orchestrator executes a versioned workflow and records replay events', async () => {
  const runtime = createRuntime();
  runtime.devices.upsert({ id: 'iphone-1', name: 'iPhone 1', udid: 'udid-1', health: 'online', tags: ['social'] });
  const workflow = runtime.workflows.save({
    name: 'Smoke test',
    pluginId: 'core',
    deviceSelector: { tags: ['social'] },
    steps: [
      { id: 'one', action: 'assertOnline' },
      { id: 'two', action: 'remember', input: { namespace: 'test', key: 'done', value: true } },
    ],
  });
  const run = runtime.orchestrator.enqueue(workflow.id);
  await runtime.orchestrator.execute(run.id);
  assert.equal(runtime.orchestrator.getRun(run.id)?.status, 'succeeded');
  assert.equal(await runtime.memory.get('iphone-1', 'test', 'done'), true);
  assert.ok(runtime.replay.forRun(run.id).some((event) => event.type === 'run.succeeded'));
});

test('workflow compiler creates ordered intent steps', async () => {
  const compiled = await new RuleWorkflowCompiler().compile('open app, then upload video, then save result');
  assert.equal(compiled.steps.length, 3);
  assert.equal(compiled.steps[0]?.id, 'step-1');
});

test('visual resolver chooses the highest matching target', async () => {
  const resolver = new ObservationVisionResolver(async () => ({
    deviceId: 'iphone-1', screenshotRef: 'shot-1', capturedAt: new Date().toISOString(),
    elements: [
      { id: 'cancel', role: 'button', text: 'Cancel', confidence: 0.99, bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'publish', role: 'button', text: 'Publish post', confidence: 0.92, bounds: { x: 10, y: 10, width: 20, height: 20 } },
    ],
  }));
  const observation = await resolver.observe({ id: 'iphone-1' } as never);
  const target = await resolver.resolveTarget(observation, 'publish post button');
  assert.equal(target?.id, 'publish');
});
