# Production Infrastructure

ZERO Farmer separates the agent platform from production infrastructure through explicit ports and adapters.

## Durable state

`PostgresRepository` persists device twins, immutable workflow versions, and workflow run state. The initial schema lives in `migrations/0001_production_core.sql` and also defines durable agent memory and replay event tables.

## Distributed coordination

`DistributedLeaseManager` prevents two workers from controlling the same physical iPhone at the same time. `DurableQueue` provides the job transport contract. Both target a Redis-compatible key/value implementation.

Device leases are mandatory before executing a queued physical-device job. A worker that cannot obtain a lease requeues the job instead of racing another worker.

## Process supervision

`ProcessSupervisor` provides restart policy, bounded restart attempts, linear backoff, state snapshots, and graceful termination for long-lived host processes. Default registrations cover Appium and the WDA supervisor worker.

Production hosts should still wrap the ZERO Farmer process itself in `launchd`, systemd, Kubernetes, or another external supervisor.

## Authentication

`ApiKeyAuthenticator` stores only SHA-256 key digests and performs constant-time comparison. `requireRole` supports `viewer`, `operator`, and `admin` authorization tiers.

Production deployments should terminate TLS before the API and source key records from a secret manager or database rather than source control.

## Local infrastructure

Run PostgreSQL and Redis for development with:

```sh
docker compose up -d
```

Apply `migrations/0001_production_core.sql` to the configured PostgreSQL database before starting durable workers.

## Next adapters

The remaining host-specific adapters are intentionally isolated: a concrete PostgreSQL client implementing `SqlExecutor`, a Redis client implementing `KeyValueStore`, WDA lifecycle management per UDID, telemetry exporters, and production secret-provider integration.
