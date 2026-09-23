CREATE TABLE core_command_receipts (
    organization_id text NOT NULL,
    actor_id text NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, actor_id, operation, idempotency_key)
);
CREATE TABLE core_audit (
    id uuid PRIMARY KEY,
    organization_id text NOT NULL,
    command_id uuid NOT NULL,
    entry jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX core_audit_tenant_time ON core_audit (organization_id, occurred_at DESC);
-- Receipt retention is explicit; deleting receipts permits old keys to execute again.
-- Audit intentionally has no cascading FK to mutable/deletable auth or incident rows.
