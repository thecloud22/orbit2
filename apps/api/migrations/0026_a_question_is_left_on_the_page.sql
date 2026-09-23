-- A question is left on the page, not held (Decision 17 item 4, procedure
-- editor R6, R19): it says which sentence it is about, the walk turn whose
-- picture shows what Orbit was looking at, what on that page could be what
-- the sentence means, and the one-click answer Orbit can act on. Null for
-- every note raised before this, and for one no sentence or page is behind.
ALTER TABLE workflow_note
  ADD COLUMN sentence text CHECK (sentence IS NULL OR sentence ~ '^([1-9][0-9]{0,3}|[A-Z]{1,2})\.[1-9][0-9]{0,4}$'),
  ADD COLUMN at_turn integer CHECK (at_turn IS NULL OR at_turn > 0),
  ADD COLUMN candidates jsonb,
  ADD COLUMN action text CHECK (action IS NULL OR action IN ('pickElement', 'useInput', 'giveExample', 'mapAgain'));
