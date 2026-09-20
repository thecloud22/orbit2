-- The error and event vocabularies, constrained by the database rather than by
-- the application alone.
--
-- Both are written onto rows that are never edited, so a typo becomes a
-- permanent fact. A CHECK is cheap and catches it at the only moment it can
-- still be caught.
--
-- Not a Postgres ENUM: altering one is awkward, and these sets will gain
-- members as the surfaces arrive. A CHECK is replaced by a migration, which is
-- the reviewable way for a closed set to change.

ALTER TABLE run_event ADD CONSTRAINT run_event_kind_known CHECK (kind IN (
  'run.queued','run.started','run.succeeded','run.failed',
  'run.cancelled','run.held','run.resumed','run.reconciled',
  'step.attempt.started','step.attempt.ended',
  'navigated','entered','activated','read','read.absent',
  'collected','checked','branch.evaluated','ended',
  'handed.off','handed.back',
  'artefact.captured','artefact.withheld','model.called'
));

ALTER TABLE run ADD CONSTRAINT run_error_kind_known CHECK (
  error IS NULL OR error->>'kind' IN (
    'controlNotFound','controlAmbiguous','corroborationFailed',
    'navigationFailed','pageNotAsExpected','addressNotPermitted',
    'valueNotOfDeclaredType','valueMissing','comparisonNotPossible','checkFailed',
    'ceilingReached','credentialMissing','authenticationFailed','authorizationFailed',
    'changeNotPermitted','applicationUnavailable','timedOut','interruptedByRestart',
    'retryExhausted','cancelled','integrityFailure',
    'terminalScreenUnexpected','serviceResponseOffContract',
    'judgementUnavailable','judgementBelowFloor','pathReachesNothing'
  ));

-- A run that failed says which kind and which step; a run that did not, has no
-- error at all. §10: a run that correctly established a record does not exist
-- has *succeeded*, and carries none.
ALTER TABLE run ADD CONSTRAINT run_error_only_when_failed CHECK (
  (status = 'failed' AND error IS NOT NULL) OR (status <> 'failed' AND error IS NULL));

ALTER TABLE run ADD CONSTRAINT run_status_known CHECK (status IN (
  'queued','running','waitingForAPerson','succeeded','handedToAPerson','failed','cancelled'));
