-- What raised a note: the walk, or the sort's confirmation. Mapping again
-- (Decision 17) replaces the walk's own open questions and assumptions with
-- the new walk's, and leaves the rest: a risk from the sort, a note the sort
-- wrote about work left to a person, and every answer a person gave.
ALTER TABLE workflow_note ADD COLUMN raised_by text CHECK (raised_by IS NULL OR raised_by IN ('walk'));
-- Notes written before this: the sort's begin "Sentence " or are risks.
UPDATE workflow_note SET raised_by = 'walk'
 WHERE kind IN ('question', 'assumption') AND body NOT LIKE 'Sentence %';
