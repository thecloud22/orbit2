-- The procedure's rules as tables (Orbit 2.1-d), made from the rule sentences
-- after each sort. A review surface: the walk is still given the sentences.
--
-- Written once, and made again whenever the sort changes — a relabel, or a
-- new part — so the latest row is the one that matches the labels. A set of
-- tables that could not be made is kept as that, with why.
CREATE TABLE rule_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigserial NOT NULL UNIQUE,
  workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  tables      jsonb,
  refused     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((tables IS NULL) <> (refused IS NULL))
);
CREATE INDEX rule_tables_latest ON rule_tables (workflow_id, seq DESC);
CREATE TRIGGER refuse_edit BEFORE UPDATE ON rule_tables FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();
GRANT SELECT, INSERT ON rule_tables TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE rule_tables_seq_seq TO orbit_app;
