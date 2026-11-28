ALTER TABLE soc_incidents
  ADD COLUMN risk_score integer CHECK (risk_score BETWEEN 0 AND 100),
  ADD COLUMN risk_level text CHECK (risk_level IN ('low','medium','high','critical')),
  ADD COLUMN risk_reasons jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN risk_updated_at timestamptz,
  ADD COLUMN pending_risk_update boolean NOT NULL DEFAULT false,
  ADD CHECK ((risk_score IS NULL) = (risk_level IS NULL));
CREATE INDEX soc_incidents_org_risk ON soc_incidents
  (organization_id, (COALESCE(risk_score,-1)) DESC, created_at DESC, id DESC);

CREATE TABLE soc_risk_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  incident_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL,
  rule_version text NOT NULL,
  score integer,
  level text,
  reasons jsonb NOT NULL,
  inputs jsonb NOT NULL,
  FOREIGN KEY (organization_id, incident_id) REFERENCES soc_incidents(organization_id, id) ON DELETE CASCADE
);
CREATE FUNCTION soc_protect_risk_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Risk revisions are immutable';
END $$;
CREATE TRIGGER soc_protect_risk_revision BEFORE UPDATE OR DELETE ON soc_risk_history
FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION soc_protect_risk_revision();

CREATE INDEX soc_risk_history_case ON soc_risk_history (organization_id, incident_id, id DESC);

-- One outstanding invalidation per case and cause. Writers serialize input changes with the
-- computation, including when an evidence assignment is still uncommitted.
CREATE TABLE soc_risk_updates (
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  cause text NOT NULL,
  PRIMARY KEY (organization_id, incident_id, cause)
);

CREATE VIEW soc_risk_alert_hashes AS
SELECT e.organization_id, e.incident_id, e.id AS evidence_id, lower(h.value) AS hash
FROM soc_evidence e
CROSS JOIN LATERAL (SELECT COALESCE(e.snapshot->'alert'->'sha256s', e.snapshot->'sha256s') AS hashes) a
CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(hashes)='array' THEN hashes ELSE '[]' END) h
WHERE e.source_id IS NOT NULL AND e.incident_id IS NOT NULL;

CREATE VIEW soc_risk_yara_sources AS
SELECT e.organization_id, e.incident_id, e.id AS evidence_id, a.job_id
FROM soc_evidence e JOIN yara_attachments a
  ON a.organization_id=e.organization_id AND a.incident_id=e.report_id
WHERE e.incident_id IS NOT NULL
UNION
SELECT h.organization_id, h.incident_id, h.evidence_id, j.id
FROM soc_risk_alert_hashes h JOIN yara_scan_jobs j
  ON j.organization_id=h.organization_id AND j.content_hash=h.hash;

CREATE VIEW soc_risk_ti_sources AS
SELECT e.organization_id, e.incident_id, e.id AS evidence_id, i.job_id
FROM soc_evidence e JOIN incident_ioc_enrichment i
  ON i.organization_id=e.organization_id AND i.incident_id=e.report_id
WHERE e.incident_id IS NOT NULL
UNION
SELECT h.organization_id, h.incident_id, h.evidence_id, j.id
FROM soc_risk_alert_hashes h JOIN ioc_enrichment_jobs j
  ON j.organization_id=h.organization_id AND j.indicator_kind='sha256' AND j.indicator_value=h.hash;

CREATE FUNCTION soc_enqueue_risk_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  linked_report uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id, 8009));
  IF TG_TABLE_NAME = 'yara_scan_jobs' THEN
    INSERT INTO soc_risk_updates SELECT DISTINCT organization_id, incident_id, 'YARA'
      FROM soc_risk_yara_sources WHERE organization_id=NEW.organization_id AND job_id=NEW.id
      ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME = 'ioc_enrichment_jobs' THEN
    INSERT INTO soc_risk_updates SELECT DISTINCT organization_id, incident_id, 'Threat Intelligence'
      FROM soc_risk_ti_sources WHERE organization_id=NEW.organization_id AND job_id=NEW.id
      ON CONFLICT DO NOTHING;
  ELSE
    IF TG_TABLE_NAME = 'soc_report_assets' THEN
      linked_report := NEW.report_id;
    ELSE
      linked_report := NEW.incident_id;
    END IF;
    INSERT INTO soc_risk_updates SELECT DISTINCT organization_id, incident_id, TG_ARGV[0]
      FROM soc_evidence WHERE organization_id=NEW.organization_id AND report_id=linked_report AND incident_id IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER soc_yara_finished AFTER UPDATE OF state ON yara_scan_jobs
FOR EACH ROW WHEN (NEW.state='completed' AND OLD.state IS DISTINCT FROM NEW.state)
EXECUTE FUNCTION soc_enqueue_risk_update();
CREATE TRIGGER soc_ti_finished AFTER UPDATE OF result ON ioc_enrichment_jobs
FOR EACH ROW WHEN (NEW.result IS NOT NULL AND OLD.result IS DISTINCT FROM NEW.result)
EXECUTE FUNCTION soc_enqueue_risk_update();
-- Cached checks can also become associated with an already accepted report.
CREATE TRIGGER soc_yara_link AFTER INSERT OR UPDATE OF job_id ON yara_attachments
FOR EACH ROW EXECUTE FUNCTION soc_enqueue_risk_update('YARA');
CREATE TRIGGER soc_ti_link AFTER INSERT ON incident_ioc_enrichment
FOR EACH ROW EXECUTE FUNCTION soc_enqueue_risk_update('Threat Intelligence');
CREATE TRIGGER soc_report_asset_changed AFTER INSERT OR UPDATE OF agent_id,source_id ON soc_report_assets
FOR EACH ROW EXECUTE FUNCTION soc_enqueue_risk_update('Potwierdzony zasób');
