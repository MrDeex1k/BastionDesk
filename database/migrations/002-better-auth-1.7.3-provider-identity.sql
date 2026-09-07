-- Better Auth 1.7.3 restores (providerId, accountId) as the account identity.
-- Keep historical issuer values; never guess or merge identities.
BEGIN;
LOCK TABLE account IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM account
        GROUP BY "providerId", "accountId" HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate providerId/accountId pairs require reviewed reconciliation before Better Auth 1.7.3';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'account' AND column_name = 'issuer'
    ) THEN
        ALTER TABLE account ALTER COLUMN issuer DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE account DROP CONSTRAINT IF EXISTS "account_issuer_accountId_key";
DROP INDEX IF EXISTS "account_issuer_accountId_key";
DROP INDEX IF EXISTS "account_issuer_accountId_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key"
ON account ("providerId", "accountId");
COMMIT;
