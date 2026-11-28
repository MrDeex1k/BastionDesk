CREATE TABLE ioc_enrichment_jobs (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('abuseipdb', 'urlhaus', 'otx', 'hybrid_analysis', 'virustotal')),
 indicator_kind text NOT NULL CHECK (indicator_kind IN ('ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256')),
 indicator_digest text NOT NULL CHECK (indicator_digest ~ '^[0-9a-f]{64}$'),
 indicator_value text NOT NULL,
 result jsonb,
 requested_by text,
 trigger_incident_id uuid NOT NULL,
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid,
 retry_at timestamptz,
 UNIQUE (organization_id, provider, indicator_kind, indicator_digest),
 UNIQUE (organization_id, id),
 CHECK ((result IS NULL AND retry_at IS NULL) OR (result IS NOT NULL AND retry_at IS NOT NULL AND lease_token IS NULL))
);
CREATE INDEX ioc_enrichment_pending ON ioc_enrichment_jobs (available_at, id) WHERE result IS NULL;

CREATE TABLE incident_ioc_enrichment (
 organization_id text NOT NULL,
 incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
 job_id uuid NOT NULL,
 PRIMARY KEY (organization_id, incident_id, job_id),
 FOREIGN KEY (organization_id, job_id) REFERENCES ioc_enrichment_jobs (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX incident_ioc_enrichment_job ON incident_ioc_enrichment (job_id);
