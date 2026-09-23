-- Orbit 2.4: a record-changing press the application refused stops the run
-- (docs/plans/2026-09-23-answer-check.md). It is its own failure: not the
-- application being unavailable, and not a press whose answer never came.
ALTER TABLE run DROP CONSTRAINT run_error_kind_known;
ALTER TABLE run ADD CONSTRAINT run_error_kind_known CHECK (
  error IS NULL OR error->>'kind' IN (
    'controlNotFound','controlAmbiguous','corroborationFailed',
    'navigationFailed','pageNotAsExpected','addressNotPermitted',
    'valueNotOfDeclaredType','valueMissing','comparisonNotPossible','checkFailed',
    'ceilingReached','credentialMissing','authenticationFailed','authorizationFailed',
    'changeNotPermitted','applicationUnavailable','timedOut','interruptedByRestart',
    'retryExhausted','cancelled','integrityFailure',
    'terminalScreenUnexpected','terminalKeyboardLocked','changeRefused',
    'serviceResponseOffContract','judgementUnavailable','judgementBelowFloor','pathReachesNothing'
  ));
