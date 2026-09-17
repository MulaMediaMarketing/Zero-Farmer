# ZERO Farmer

ZERO Farmer is a production-oriented orchestration platform for managing physical iOS devices and autonomous iOS application agents.

It is designed to evolve beyond fixed-coordinate automation into a resilient iOS agent platform with visual reasoning, versioned workflows, device memory, recovery, replay, plugin isolation, and fleet-scale orchestration.

## Platform capabilities

1. **Visual Agent Runtime** — screen observations, OCR/object metadata contracts, confidence-based target resolution, and an extensible vision adapter.
2. **Self-Healing Automation** — visual fallback resolution for changed UI targets instead of hard-failing on stale selectors.
3. **Per-Device / Per-Account Memory** — namespaced persistent-agent memory contracts for state, cooldowns, workflow context, and learned behavior.
4. **Natural-Language Workflow Builder** — prompt-to-versioned-workflow compiler with a replaceable AI compiler interface.
5. **Multi-Agent Orchestrator** — chooses eligible devices by health/tags and executes version-pinned workflows with retries.
6. **Digital Device Twins** — real-time device records for health, battery, temperature, storage, network, active run, failures, and app state.
7. **Recovery Engine** — named recovery policies that can restart/recover/quarantine devices without coupling workflow definitions to transport code.
8. **Execution Replay** — durable-style event model for every run and step, suitable for debugging, playback, and audit trails.
9. **Plugin SDK** — versioned agent plugins exposing isolated capabilities and actions.
10. **Fleet Intelligence** — live fleet/run metrics including device health, queue state, failures, and success rate.

## Physical iOS control

`src/device-driver.ts` defines the transport boundary for real iPhones and includes an Appium implementation for:

- session creation/deletion
- screenshots
- page source
- touch input
- app activation
- server health/status

The rest of ZERO Farmer talks to device abstractions rather than hardcoding Appium/WDA behavior into workflows.

## Run locally

Requirements: Node.js 22+.

```bash
npm install
npm run check
npm test
npm run dev
```

Default server: `http://127.0.0.1:8787`

### Core API

- `GET /health`
- `GET /api/v1/fleet`
- `GET /api/v1/devices`
- `POST /api/v1/devices`
- `GET /api/v1/plugins`
- `GET /api/v1/workflows`
- `POST /api/v1/workflows`
- `POST /api/v1/workflows/compile`
- `POST /api/v1/workflows/:id/runs`
- `GET /api/v1/runs`
- `GET /api/v1/runs/:id/replay`
- `GET /api/v1/recovery-actions`

## Architecture direction

```text
Physical iPhones
      |
Appium / WebDriverAgent
      |
Device Driver Boundary
      |
Digital Device Twins
      |
Visual Intelligence + Self Healing
      |
Agent Plugins + Memory
      |
Versioned Workflow Engine
      |
Multi-Agent Orchestrator
      |
Recovery + Replay
      |
Fleet Intelligence / API
```

## Production principles

- device transport is isolated from workflow logic
- workflows are immutable by version during execution
- plugins own app-specific automation logic
- retries and recovery are explicit
- unstable devices can be degraded/quarantined
- every run emits replayable events
- future AI/vision providers plug into interfaces instead of becoming platform dependencies
- no production Apple signing material or device credentials should ever be committed to this repository
