# apps

Every runnable application, in one place.

## Practice portals

Four deliberately awkward applications that Orbit is pointed at. They are not
product code and they never ship. Their job is to make an acceptance criterion
reproducible on demand — a control that resolves twice, a session that expires
mid-run, a page that takes seconds to come back — which is something no real
application will do when you ask it to.

| | Surface | What it is for |
|---|---|---|
| `legacy-portal` | Browser, server-rendered | Tables for layout, forms that POST and reload, and not one test id anywhere. The hard case. |
| `library-portal` | Browser, React | A modern page, including a switch that makes it drift under a recorded binding. |
| `mortgage-portal` | Browser, React | A second modern application, so a run can span two of them. |
| `terminal-portal` | Terminal | A 3270-style host, so the surface a step runs on is proved to follow the application and not the step. |

## Product

Orbit's own applications land here too — the API, the worker and the web
interface — alongside the portals rather than in a directory of their own.
Shared code lives in `packages/`.
