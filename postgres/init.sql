-- Runs on first start of the postgres volume.
-- One dev database (schema via push / dev server) and one *_bench database
-- (production container) per CMS.
--   payload, payload_bench  -- owner payload (the superuser from POSTGRES_USER)
--   emdash,  emdash_bench   -- owner emdash
--   strapi,  strapi_bench   -- owner strapi
CREATE DATABASE payload_bench;

CREATE ROLE emdash LOGIN PASSWORD 'emdash';
CREATE DATABASE emdash OWNER emdash;
CREATE DATABASE emdash_bench OWNER emdash;

CREATE ROLE strapi LOGIN PASSWORD 'strapi';
CREATE DATABASE strapi OWNER strapi;
CREATE DATABASE strapi_bench OWNER strapi;

-- Per-query statistics (needs shared_preload_libraries=pg_stat_statements).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
\c payload_bench
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
\c emdash_bench
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
\c strapi_bench
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
