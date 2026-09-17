# Production Control Plane

ZERO Farmer includes an embedded operations control plane so a physical iOS fleet can be observed and controlled without bypassing orchestration rules.

## Endpoints

- `/` built-in fleet dashboard
- `/livez` process liveness
- `/readyz` service readiness
- `/metrics` Prometheus text metrics
- `/api/v1/audit` recent control-plane audit events
- `/api/v1/devices/:id/quarantine` operator quarantine action
- `/api/v1/devices/:id/restore` operator restore action

Existing fleet, workflow, run, replay, plugin, and recovery endpoints remain available under `/api/v1`.

## Authentication

Set `ZERO_FARMER_API_KEYS` to a comma-separated list of control-plane keys. When configured, all `/api/` routes require `x-api-key`. Dashboard code stores the operator-entered key in browser local storage and sends it only to the same origin.

For Internet-exposed deployments, terminate TLS at a trusted reverse proxy and replace static API keys with an SSO/OIDC provider before production rollout.

## Rate limiting

The in-process limiter protects the API from accidental request floods. Multi-host deployments should enforce the authoritative limit at the ingress proxy or through a Redis-backed limiter.

## Audit and metrics

Quarantine, restore, denied authentication, and rate-limit events are captured in the in-memory audit ring. Production deployments should export audit events to durable storage/SIEM. Prometheus-compatible counters and gauges include HTTP activity, fleet/device health, run state, control actions, and errors.

## Dashboard

The embedded dashboard provides a zero-dependency fleet control room with five-second refresh, fleet health, recent runs, Appium/WDA ports, and device quarantine/restore actions.
