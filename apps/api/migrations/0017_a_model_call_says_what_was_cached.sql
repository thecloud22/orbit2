-- What of a call's input the provider read from its prompt cache, and what it
-- wrote there. OpenAI caches on its own and, on the newer models, bills a
-- write at 1.25× the input rate and a read at 0.1×. Without these the cost on
-- the record could not be checked against the tokens beside it.
--
-- Null on calls recorded before this, which were not counted, rather than a
-- zero that would say nothing was cached.
ALTER TABLE model_call ADD COLUMN tokens_cached integer CHECK (tokens_cached >= 0);
ALTER TABLE model_call ADD COLUMN tokens_cache_written integer CHECK (tokens_cache_written >= 0);
