-- What a draft declares before it is published: its inputs, the conclusions it
-- may reach, and an example value for each of them.
--
-- The examples are not decoration. §4 gates activation on proving every
-- declared ending with a test run, and those runs are made with the values the
-- process owner themselves supplied — so an ending with no example is an
-- ending nothing could ever prove, and publication refuses it.

ALTER TABLE workflow ADD COLUMN IF NOT EXISTS declared_inputs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS outcomes        jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS examples        jsonb NOT NULL DEFAULT '{}'::jsonb;
