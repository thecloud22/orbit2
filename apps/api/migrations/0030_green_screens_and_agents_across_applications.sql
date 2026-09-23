-- Orbit 2.2: the green-screen connector, and agents that work across
-- applications (docs/plans/2026-09-23-green-screen-connector.md).

-- 1. A keyboard the host left locked is its own failure (C10): it is never
--    retried blindly, and "the application did not answer" would say otherwise.
ALTER TABLE run DROP CONSTRAINT run_error_kind_known;
ALTER TABLE run ADD CONSTRAINT run_error_kind_known CHECK (
  error IS NULL OR error->>'kind' IN (
    'controlNotFound','controlAmbiguous','corroborationFailed',
    'navigationFailed','pageNotAsExpected','addressNotPermitted',
    'valueNotOfDeclaredType','valueMissing','comparisonNotPossible','checkFailed',
    'ceilingReached','credentialMissing','authenticationFailed','authorizationFailed',
    'changeNotPermitted','applicationUnavailable','timedOut','interruptedByRestart',
    'retryExhausted','cancelled','integrityFailure',
    'terminalScreenUnexpected','terminalKeyboardLocked','serviceResponseOffContract',
    'judgementUnavailable','judgementBelowFloor','pathReachesNothing'
  ));

-- 2. A person has looked at what a part-way run left behind (C15). Until one
--    has, a run that pressed a record-changing key and never saw the answer is
--    not run again.
ALTER TABLE run_event DROP CONSTRAINT run_event_kind_known;
ALTER TABLE run_event ADD CONSTRAINT run_event_kind_known CHECK (kind IN (
  'run.queued','run.started','run.succeeded','run.failed',
  'run.cancelled','run.held','run.resumed','run.reconciled','run.checked',
  'step.attempt.started','step.attempt.ended',
  'navigated','entered','activated','read','read.absent',
  'collected','checked','branch.evaluated','ended',
  'handed.off','handed.back',
  'artefact.captured','artefact.withheld','model.called'
));

-- 3. A green screen's settings, on the revision like its addresses: how s3270
--    is told to speak to the host. Null for a web application.
ALTER TABLE application_revision ADD COLUMN terminal jsonb;

-- 4. The applications an agent works across, beyond the one it was brought in
--    against (C11). Added by the author; the version copies them all.
CREATE TABLE workflow_application (
  workflow_id    uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES application(id),
  -- Where the walk opens it. A green screen has no paths and ignores it.
  start_path     text NOT NULL DEFAULT '/',
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, application_id)
);
GRANT SELECT, INSERT, DELETE ON workflow_application TO orbit_app;

-- 5. Which application each sentence happens on (C11): proposed by the sort
--    when an agent works across several, changed by the author like a label.
--    Kept apart from the label, so changing one never re-writes the other.
CREATE TABLE sentence_application (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigserial NOT NULL UNIQUE,
  sentence_id    uuid NOT NULL REFERENCES procedure_sentence(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES application(id),
  given_by       text NOT NULL CHECK (given_by IN ('model', 'author')),
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sentence_application_latest ON sentence_application (sentence_id, seq DESC);
CREATE TRIGGER refuse_edit BEFORE UPDATE ON sentence_application
  FOR EACH ROW EXECUTE FUNCTION orbit_refuse_mutation();
GRANT SELECT, INSERT ON sentence_application TO orbit_app;
GRANT USAGE, SELECT ON SEQUENCE sentence_application_seq_seq TO orbit_app;

-- 6. What each worker can drive (C4): reported when it starts, so publication
--    can refuse an agent no worker could run, naming the missing connector.
CREATE TABLE worker_connector (
  worker      text NOT NULL,
  connector   text NOT NULL,
  ready       boolean NOT NULL,
  why         text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker, connector)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_connector TO orbit_app;
