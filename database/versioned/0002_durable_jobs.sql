CREATE TABLE core_jobs (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 incident_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind = 'incident.classify.v1'),
 correlation_id uuid NOT NULL,
 causation_id uuid NOT NULL,
 traceparent text,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 publish_after timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid,
 lease_until timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 UNIQUE (organization_id, incident_id, kind),
 CHECK ((state = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX core_jobs_dispatch ON core_jobs (publish_after, available_at)
 WHERE state IN ('pending','running','dead');
CREATE INDEX core_jobs_tenant ON core_jobs (organization_id, created_at);
