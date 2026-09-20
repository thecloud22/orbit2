-- A registered application is three things kept apart (Decision 5): a stable
-- identity carrying operational state, an append-only sequence of definition
-- revisions, and a copy of the resolved revision inside each published version.
-- Editing this registry must never widen what a live version may reach.

CREATE TABLE application (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  surface       text NOT NULL CHECK (surface IN ('browser', 'terminal')),
  owner_note    text,
  retired_at    timestamptz,                       -- retirement is a status, never a delete
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- An administrator's edit mints one of these. It never alters one.
CREATE TABLE application_revision (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES application(id),
  revision       integer NOT NULL,
  -- host and path prefix, because a WebSEAL junction puts everything under one host
  addresses      jsonb NOT NULL,
  sign_in_as     text,
  credential_name text,
  -- how this application's screens write numbers and dates, so parsing is
  -- exact rather than heuristic (Decision 14 item 2)
  formats        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, revision)
);

-- The value the deployment holds, encrypted, written out of band and never
-- through the product (Decision 5 item 5). No interface returns this column.
CREATE TABLE credential (
  name        text PRIMARY KEY,
  secret_enc  bytea NOT NULL,
  key_id      text NOT NULL,           -- which key encrypted it; the key is not here
  rotated_at  timestamptz NOT NULL DEFAULT now()
);

SELECT orbit_make_append_only('application_revision');
GRANT SELECT, INSERT, UPDATE ON application TO orbit_app;
GRANT SELECT ON credential TO orbit_app;
