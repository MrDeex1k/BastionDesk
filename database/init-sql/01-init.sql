-- The official PostgreSQL entrypoint creates POSTGRES_USER and POSTGRES_DB
-- before executing these scripts inside that database. Do not create a second,
-- hard-coded database here: CREATE DATABASE is not allowed in a DO block.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
