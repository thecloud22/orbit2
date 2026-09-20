# apps

Orbit itself.

| | What it is |
|---|---|
| `api` | The HTTP surface and the migrations. Connects as `orbit_app`, which holds INSERT and SELECT on the immutable tables and nothing else. |
| `web` | The interface. Every colour is a custom property resolved at run time, so branding is data rather than a rebuild. |
| `worker` | Executes a published version, one step attempt at a time. No model is consulted here. |

The applications Orbit is *pointed at* live in `demo/`. Shared code is in `packages/`.
