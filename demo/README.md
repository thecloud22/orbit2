# demo

The applications Orbit is pointed at. **Not product code, and they never ship.**

Their job is to make an acceptance criterion reproducible on demand — a control
that resolves twice, a session that expires mid-run, a page that takes seconds
to come back. No real application will do any of that when you ask it to, which
is why simulating is better here rather than a compromise.

| | Surface | What it is for |
|---|---|---|
| `legacy-portal` | Browser, server-rendered | Tables for layout, forms that POST and reload, and not one test id anywhere. The hard case, and the one the binder is measured against. |
| `library-portal` | Browser, React | A modern page, with a switch that makes it drift under a recorded binding. |
| `mortgage-portal` | Browser, React | A second modern application, so a run can span two. |
| `terminal-portal` | Terminal | A 3270-style host, so "the surface follows the application, not the step" is proved rather than asserted. |

**The binder never reads `data-testid`.** These portals carry them for their own
Playwright suites; Orbit ignores the attribute entirely. A test id exists for a
test, changes without warning, and is absent from every application a customer
actually runs — `library-portal`'s drift switch renames one precisely to show
that the binding which survives is the one worth having.
