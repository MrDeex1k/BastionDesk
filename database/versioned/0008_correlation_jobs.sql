CREATE TABLE soc_correlation_jobs (
 organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 target_kind text NOT NULL CHECK (target_kind IN ('report','case')),
 target_id uuid NOT NULL,
 report_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='report' THEN target_id END) STORED,
 case_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='case' THEN target_id END) STORED,
 FOREIGN KEY (organization_id,report_id) REFERENCES incidents ("organizationId",id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,case_id) REFERENCES soc_incidents (organization_id,id) ON DELETE CASCADE,
 PRIMARY KEY (organization_id, target_kind, target_id),
 available_at timestamptz,
 lease_token uuid,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 failed boolean NOT NULL DEFAULT false
);
CREATE INDEX soc_correlation_due ON soc_correlation_jobs (available_at) WHERE available_at IS NOT NULL;

CREATE FUNCTION soc_attachment_sha256s(metadata jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    WITH decoded AS (
        SELECT CASE WHEN jsonb_typeof(metadata) = 'string'
            AND pg_input_is_valid(metadata #>> '{}', 'jsonb')
            THEN (metadata #>> '{}')::jsonb ELSE metadata END AS value
    ), hashes AS (
        SELECT lower(regexp_replace(item->>'contentHash', '^[[:space:]]+|[[:space:]]+$', '', 'g')) AS hash
        FROM decoded, LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(value)='array' THEN value ELSE jsonb_build_array(value) END
        ) AS item
    )
    SELECT ARRAY(SELECT DISTINCT hash FROM hashes WHERE hash ~ '^[0-9a-f]{64}$' ORDER BY hash)
$$;
CREATE INDEX soc_report_attachment_sha256s ON incidents USING gin (soc_attachment_sha256s("userAttachmentMetadata"));

CREATE TABLE soc_suggestions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 report_id uuid NOT NULL,
 source_id text NOT NULL,
 index_name text NOT NULL,
 document_id text NOT NULL,
 alert jsonb NOT NULL,
 confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
 signals jsonb NOT NULL,
 version text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
 decided_by text,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,report_id) REFERENCES incidents ("organizationId",id) ON DELETE CASCADE,
 UNIQUE (organization_id,report_id,source_id,index_name,document_id)
);
CREATE INDEX soc_suggestions_alert ON soc_suggestions (organization_id,source_id,index_name,document_id);
