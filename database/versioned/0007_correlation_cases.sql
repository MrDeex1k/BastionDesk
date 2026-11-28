ALTER TABLE wazuh_sources ADD COLUMN source_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX incidents_org_report ON incidents ("organizationId", id);

CREATE TABLE soc_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    note text CHECK (length(note) <= 4000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    analyst_id text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, id)
);
CREATE INDEX soc_incidents_org_created ON soc_incidents (organization_id, created_at DESC, id DESC);

CREATE TABLE soc_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    incident_id uuid,
    report_id uuid,
    source_id text,
    index_name text,
    document_id text,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id, incident_id) REFERENCES soc_incidents (organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, report_id) REFERENCES incidents ("organizationId", id) ON DELETE CASCADE,
    CHECK ((report_id IS NOT NULL AND source_id IS NULL AND index_name IS NULL AND document_id IS NULL)
        OR (report_id IS NULL AND source_id IS NOT NULL AND index_name IS NOT NULL AND document_id IS NOT NULL))
);
CREATE UNIQUE INDEX soc_evidence_active_report ON soc_evidence (organization_id, report_id)
    WHERE incident_id IS NOT NULL AND report_id IS NOT NULL;
CREATE UNIQUE INDEX soc_evidence_active_alert ON soc_evidence (organization_id, source_id, index_name, document_id)
    WHERE incident_id IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX soc_evidence_case ON soc_evidence (organization_id, incident_id, created_at);

CREATE TABLE soc_case_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id text NOT NULL,
    incident_id uuid NOT NULL,
    action text NOT NULL,
    actor_id text NOT NULL,
    reason text,
    detail jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id, incident_id) REFERENCES soc_incidents (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX soc_case_history_case ON soc_case_history (organization_id, incident_id, id DESC);

CREATE TABLE soc_report_assets (
    organization_id text NOT NULL,
    report_id uuid NOT NULL,
    source_id text NOT NULL,
    agent_id text NOT NULL,
    actor_id text NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, report_id),
    FOREIGN KEY (organization_id, report_id) REFERENCES incidents ("organizationId", id) ON DELETE CASCADE
);
CREATE INDEX soc_report_assets_agent ON soc_report_assets (organization_id, source_id, agent_id);
