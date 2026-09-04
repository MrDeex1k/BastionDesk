BEGIN;

ALTER TABLE account
ADD COLUMN IF NOT EXISTS issuer text;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM account WHERE issuer IS NULL) THEN
		RAISE EXCEPTION USING
			MESSAGE = 'account identity migration requires a reviewed Better Auth 1.7 issuer backfill',
			HINT = 'Run the Better Auth 1.7 migration plan for populated account data; do not infer OAuth issuers.';
	END IF;
END
$$;

ALTER TABLE account
ALTER COLUMN issuer SET NOT NULL;

ALTER TABLE account
DROP CONSTRAINT IF EXISTS "account_providerId_accountId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_key"
ON account (issuer, "accountId");

COMMIT;
