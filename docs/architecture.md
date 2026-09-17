# ZERO Farmer Architecture

## Goal

ZERO Farmer is a general-purpose iOS agent fleet platform. App-specific behavior belongs in plugins; device transport, scheduling, memory, observability, recovery, and policy remain platform concerns.

## Core layers

### 1. Device transport
`IOSDeviceDriver` abstracts Appium/WebDriverAgent operations. The initial `AppiumIOSDriver` supports sessions, screenshots, source, touch input, app activation, and server status.

### 2. Digital twins
`DeviceRegistry` maintains the current operational model for each phone: identity, ports, health, tags, battery, thermal/storage/network state, active run, and failure count.

### 3. Visual intelligence
`VisionPort` separates screenshot understanding from execution. `ObservationVisionResolver` scores available visual elements against an intent and provides a fallback target for self-healing flows.

### 4. Agent memory
`AgentMemory` stores namespaced values per device and optional account key. The in-memory adapter is the reference implementation; production deployment should replace it with a durable store.

### 5. Workflow model
Workflows are versioned. A run pins the exact workflow version at queue time so a later edit cannot silently change a running or scheduled contract.

### 6. Plugin SDK
`AgentPlugin` packages app-specific actions, capabilities, version metadata, and health checks. Core orchestration does not know the UI or business rules of Instagram, TikTok, LinkedIn, Hinge, or any future app.

### 7. Orchestration
`AgentOrchestrator` selects eligible healthy devices, executes workflow steps in order, applies retries, records events, and invokes named recovery policies.

### 8. Recovery
`RecoveryEngine` maps policy names to device-level recovery actions. Production policies can restart WDA/Appium, reopen applications, reboot devices, re-establish sessions, or quarantine unstable hardware.

### 9. Replay and observability
`ReplayLog` records run and step events. Fleet intelligence aggregates device/run state and success rate. Production adapters should persist events and expose tracing/metrics.

### 10. Natural-language workflows
`WorkflowCompilerPort` is the provider boundary. `RuleWorkflowCompiler` is a deterministic baseline. A future LLM compiler can generate the same strongly versioned workflow structure without changing the scheduler.

## Required production adapters

Before a large physical fleet rollout, replace in-memory reference adapters with PostgreSQL/Redis persistence, a durable queue, distributed locks, secret management, authenticated API access, WDA/Appium supervisors, telemetry exporters, and a real vision/LLM provider.

## Safety and isolation

- Validate every plugin input.
- Do not expose raw shell execution to untrusted workflows.
- Keep Apple signing assets and device credentials outside source control.
- Bind the management API to loopback by default or place it behind authentication/TLS.
- Rate-limit device actions and protect against concurrent control of one device.
- Record operator and automation actions for auditing.
- Enforce plugin capability declarations before execution.
