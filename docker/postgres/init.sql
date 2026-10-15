-- Runs once when the local Postgres volume is created.
-- Creates the three login roles described in ADR-0003. Dev passwords only.

CREATE ROLE wes_owner LOGIN PASSWORD 'wes_owner_dev';
CREATE ROLE wes_app LOGIN PASSWORD 'wes_app_dev' NOBYPASSRLS;
CREATE ROLE wes_worker LOGIN PASSWORD 'wes_worker_dev' NOBYPASSRLS;

ALTER DATABASE wes OWNER TO wes_owner;
GRANT ALL ON SCHEMA public TO wes_owner;

\connect wes
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER SCHEMA public OWNER TO wes_owner;
