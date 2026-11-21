CREATE TABLE wazuh_sources (
    organization_id text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
    revision uuid NOT NULL,
    origin text NOT NULL,
    username text NOT NULL,
    ca_pem text,
    encrypted_password text NOT NULL,
    enabled boolean NOT NULL DEFAULT TRUE
);
