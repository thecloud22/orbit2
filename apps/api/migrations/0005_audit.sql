-- One searchable history of every attributable act, append-only.
-- The actor column is null for now and that is deliberate: Orbit has no
-- sign-in, so it cannot attribute an act to a person and will not invent one
-- (Decision 1). Entries written before identity arrives can never be filled
-- in, because nothing here edits an entry.
--
-- prev_digest is reserved for the hash chain that makes the history
-- tamper-evident as well as append-only. Decision 3 defers writing it; the
-- column exists now so that arrival is additive.

CREATE TABLE audit_entry (
  id           bigserial PRIMARY KEY,
  act          text NOT NULL,
  object_kind  text NOT NULL,
  object_id    uuid,
  changed      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason       text,
  actor        uuid,
  run_id       uuid REFERENCES run(id),
  prev_digest  text,
  digest       text,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_by_object ON audit_entry (object_kind, object_id, id);
CREATE INDEX audit_by_time ON audit_entry (at DESC);

SELECT orbit_make_append_only('audit_entry');
GRANT USAGE, SELECT ON SEQUENCE audit_entry_id_seq TO orbit_app;
