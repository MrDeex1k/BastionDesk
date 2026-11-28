CREATE TABLE yara_rule_sets (
 organization_id text NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
 version text NOT NULL,
 rules text NOT NULL,
 PRIMARY KEY (organization_id, version)
);
CREATE TABLE yara_active_rule_sets (
 organization_id text PRIMARY KEY,
 version text NOT NULL,
 FOREIGN KEY (organization_id, version) REFERENCES yara_rule_sets (organization_id, version) ON DELETE CASCADE
);
CREATE TABLE yara_scan_jobs (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
 rule_version text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 publish_after timestamptz NOT NULL DEFAULT clock_timestamp(),
 publication_token uuid,
 lease_token uuid,
 lease_until timestamptz,
 matches text[],
 completed_at timestamptz,
 UNIQUE (organization_id, content_hash, rule_version),
 UNIQUE (organization_id, id),
 FOREIGN KEY (organization_id, rule_version) REFERENCES yara_rule_sets (organization_id, version) ON DELETE CASCADE,
 CHECK ((state = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK ((state = 'completed') = (matches IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX yara_scan_dispatch ON yara_scan_jobs (publish_after, available_at)
 WHERE state IN ('pending','running','dead');
CREATE TABLE yara_attachments (
 organization_id text NOT NULL,
 incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
 storage_key text NOT NULL,
 job_id uuid NOT NULL,
 PRIMARY KEY (organization_id, incident_id, storage_key),
 FOREIGN KEY (organization_id, job_id) REFERENCES yara_scan_jobs (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX yara_attachments_job ON yara_attachments (organization_id, job_id);
CREATE TABLE yara_attachment_history (
 organization_id text NOT NULL,
 incident_id uuid NOT NULL,
 storage_key text NOT NULL,
 job_id uuid NOT NULL,
 PRIMARY KEY (organization_id, incident_id, storage_key, job_id),
 FOREIGN KEY (organization_id, incident_id, storage_key)
   REFERENCES yara_attachments (organization_id, incident_id, storage_key) ON DELETE CASCADE,
 FOREIGN KEY (organization_id, job_id) REFERENCES yara_scan_jobs (organization_id, id) ON DELETE CASCADE
);
