-- Additive migration: existing accounts, sessions, organizations and PassKeys stay unchanged.
-- Better Auth encrypts privateKey using the existing BETTER_AUTH_SECRET.
CREATE TABLE jwks (
    id TEXT PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    alg TEXT,
    crv TEXT
);
CREATE INDEX jwks_created_at_idx ON jwks ("createdAt" DESC);
