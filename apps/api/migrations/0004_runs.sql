-- A run is advanced one step attempt at a time, and every attempt is written
-- before the side effect and again after it (Decision 2). An attempt that
-- started and never ended is exactly the interrupted case, and it is found by
-- a query rather than by inference.

CREATE TABLE run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES workflow_version(id),
  reference       text NOT NULL UNIQUE,          -- what a person quotes: 8F42C1
  -- technical status and business outcome are two facts and are never merged
  status          text NOT NULL,
  outcome         text,
  is_test         boolean NOT NULL DEFAULT false,
  inputs          jsonb NOT NULL,                -- validated before the run existed
  outputs         jsonb,
  -- typed error naming the kind of failure and the step (§13)
  error           jsonb,
  started_by      uuid,                          -- null until identity exists
  -- the worker that holds it, and until when. A dead lease is what the
  -- reconciler sweeps, so a crashed worker is found without a restart.
  claimed_by      text,
  lease_expires_at timestamptz,
  queued_at       timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  ended_at        timestamptz
);
CREATE INDEX run_claimable ON run (status, lease_expires_at) WHERE ended_at IS NULL;

CREATE TABLE step_attempt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES run(id),
  -- position within the immutable version, which is safe precisely because the
  -- version is immutable: within one version a position never moves
  step_position integer NOT NULL,
  step_kind     text NOT NULL,
  attempt       integer NOT NULL,
  pass          integer,                          -- which `for each` pass, if any
  outcome       text,                             -- null while it is still running
  error         jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  UNIQUE (run_id, step_position, attempt, pass)
);

-- The complete record. The timeline is the readable view; this is the whole one.
CREATE TABLE run_event (
  id            bigserial PRIMARY KEY,
  run_id        uuid NOT NULL REFERENCES run(id),
  attempt_id    uuid REFERENCES step_attempt(id),
  kind          text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor         uuid,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX run_event_by_run ON run_event (run_id, id);

-- Metadata and a digest; the bytes live outside the transactional store.
-- A withheld artefact is a first-class record carrying its reason, not an error.
CREATE TABLE artefact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES run(id),
  attempt_id    uuid REFERENCES step_attempt(id),
  kind          text NOT NULL,
  media_type    text,
  bytes         bigint,
  digest        text,                             -- also the address in the store
  withheld      boolean NOT NULL DEFAULT false,
  withheld_why  text,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((withheld AND digest IS NULL AND withheld_why IS NOT NULL)
      OR (NOT withheld AND digest IS NOT NULL))
);

-- What a model was shown, what it answered, and what it cost — including the
-- calls that produced nothing usable (§12).
CREATE TABLE model_call (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid REFERENCES workflow(id),
  run_id        uuid REFERENCES run(id),
  turn          integer NOT NULL,
  provider      text NOT NULL,
  model         text NOT NULL,                    -- the model that answered
  shown         jsonb NOT NULL,
  answered      jsonb,
  verdict       text NOT NULL,                    -- kept | discarded | rejected
  why           text,
  tokens_in     integer,
  tokens_out    integer,
  cost_micros   bigint,
  at            timestamptz NOT NULL DEFAULT now()
);

SELECT orbit_make_append_only('run_event');
SELECT orbit_make_append_only('artefact');
SELECT orbit_make_append_only('model_call');
GRANT SELECT, INSERT, UPDATE ON run, step_attempt TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE run_event_id_seq TO orbit_app;
