---
description: Start, stop or restart Orbit's local processes
argument-hint: "[start|stop|restart|status|logs <name>]"
allowed-tools: Bash(./scripts/orbit:*), Bash(scripts/orbit:*)
---

Run `./scripts/orbit $ARGUMENTS` from the repository root. With no argument it
reports status.

Then say, in one or two lines, what is running and what is not. If something is
down, read its log under `var/log/` and say why rather than only that it failed.

Two things the script encodes, worth repeating if they come up:

- The worker is the only process that talks to the model. Restarting the API
  after changing a key in `.env` looks like it worked and changes nothing.
- Both the API and the worker are started with `--env-file`, so they read
  `.env` themselves. Never `source .env` into a shell and launch from it: the
  values get baked into that process and the next restart silently keeps the
  old ones.

Do not start any of these another way. A second copy on the same port is the
failure this script exists to prevent, and the one answering is not necessarily
the one that was just restarted.
