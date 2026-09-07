\set ON_ERROR_STOP on
CREATE SCHEMA phase1_migration;
SET search_path TO phase1_migration;
CREATE TABLE account (
    id text PRIMARY KEY,
    "providerId" text NOT NULL,
    "accountId" text NOT NULL,
    issuer text NOT NULL,
    UNIQUE (issuer, "accountId")
);
INSERT INTO account VALUES ('old', 'credential', 'user-a', 'credential');
\i /migration.sql
\i /migration.sql
INSERT INTO account (id, "providerId", "accountId") VALUES ('new', 'credential', 'user-b');
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM account WHERE id = 'old' AND issuer = 'credential') THEN
        RAISE EXCEPTION 'Existing identity was changed';
    END IF;
    BEGIN
        INSERT INTO account (id, "providerId", "accountId") VALUES ('duplicate', 'credential', 'user-a');
        RAISE EXCEPTION 'Duplicate account identity accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
END $$;
DROP SCHEMA phase1_migration CASCADE;
