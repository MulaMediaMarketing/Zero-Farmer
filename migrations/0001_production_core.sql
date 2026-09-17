BEGIN;

CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflows (
  id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id text PRIMARY KEY,
  status text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS workflow_runs_updated_at_idx ON workflow_runs(updated_at DESC);
CREATE INDEX IF NOT EXISTS devices_updated_at_idx ON devices(updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_memory (
  device_id text NOT NULL,
  account_key text NOT NULL DEFAULT '',
  namespace text NOT NULL,
  memory_key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, account_key, namespace, memory_key)
);

CREATE TABLE IF NOT EXISTS replay_events (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS replay_events_run_idx ON replay_events(run_id, id);

COMMIT;
