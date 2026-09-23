-- What the page looked like when the model was asked, for each turn of a walk
-- (Decision 4, item 12: an authoring session is evidenced by a screenshot at
-- each material action). The digest of the picture in the evidence store, or
-- why it was withheld — a sign-in page is never captured (item 13).
ALTER TABLE model_call ADD COLUMN screenshot jsonb;
