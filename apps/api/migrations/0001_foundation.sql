-- Two roles, because "immutable" has to mean something the application cannot
-- undo. The owner holds the tables and may change their shape; the application
-- connects as orbit_app and is given, on the immutable tables, only INSERT and
-- SELECT. Decision 3: immutable in fact, not by convention.
--
-- A trigger is the second lock rather than the only one. A trigger can be
-- disabled by whoever can also grant privileges, so neither alone is the
-- answer, and both are cheap.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_app') THEN
    CREATE ROLE orbit_app LOGIN PASSWORD 'orbit_app_local_only';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Raised when anything tries to change a row that is, by decision, a fact.
CREATE OR REPLACE FUNCTION orbit_refuse_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'orbit: % on %.% is refused; this table is append-only',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

-- Applied to every table that holds a fact rather than a state.
CREATE OR REPLACE FUNCTION orbit_make_append_only(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  trigger_name text := 'refuse_mutation';
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation()',
    trigger_name, target);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM orbit_app', target);
  EXECUTE format('GRANT INSERT, SELECT ON %s TO orbit_app', target);
END
$$;

CREATE TABLE migration_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
