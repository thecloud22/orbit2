-- The walk turn that made a step (procedure editor R5, R7), so a step reaches
-- the picture Orbit captured when it found the step's element: the turn's
-- `model_call.screenshot`, which since this migration may also carry where on
-- the picture the element was (`box`). Null for a step no turn made — one
-- added by hand, the opening step, an ending, or one compiled from a rule
-- table — and for every step drafted before this.
ALTER TABLE workflow_step ADD COLUMN made_at_turn integer CHECK (made_at_turn IS NULL OR made_at_turn > 0);
