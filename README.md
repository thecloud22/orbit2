# Orbit 2.0

Turns a written business procedure into an agent that executes it against a
real business application, and leaves evidence.

The claim the whole thing is built to support: **tell what the agent did, and
be sure it could not have done anything else.**

---

## Getting it running

You need **Node 22.6 or newer**, **pnpm**, and a **PostgreSQL** server it can
reach — installed, in a container, or remote. No postgres client is needed;
Orbit creates and migrates its databases through the driver it already ships
with. Then:

```
git clone git@github.com:thecloud22/orbit2.git
cd orbit2
pnpm run setup
```

(`pnpm run setup`, not `pnpm setup` — pnpm has a built-in command by that name
which manages pnpm's own installation, and it wins. `scripts/setup` still
works too.)

Setup checks what is installed, writes `.env` from `.env.example`,
installs the workspace and Chromium, creates `orbit2_dev` and `orbit2_test`,
and runs the migrations on both. It is safe to run twice.

**If your PostgreSQL is in a container**, do this first, because setup's first
guess is one installed locally answering as you:

```
cp .env.example .env
```

and set the three database lines to the role the image was started with —
`.env.example` shows the shape. Then `pnpm run setup`. It creates and migrates
whatever those URLs name; it no longer assumes a socket, a port or a role. If
it cannot reach them it stops and says which URL it tried.

It leaves two values in `.env` for you, because a setup script that invents a
key is one somebody has to audit:

| | |
|---|---|
| `OPENAI_API_KEY` | Needed to **bring a procedure in**. A published agent consults no model when it runs, so leave it blank and everything but authoring still works. |
| `ORBIT_CREDENTIAL_KEY` | Encrypts the passwords of registered systems. Any long random string. It is not in the database, so a backup on its own decrypts nothing. |

### The model

Only **authoring** uses one. A published agent consults no model when it runs
(Decision 6) and the worker executes with none of these set, so everything
after publication works with nothing configured here.

**OpenAI** is the default: set `OPENAI_API_KEY`.

**Bedrock** instead, with no key at all:

```
ORBIT_MODEL_PROVIDER=bedrock
ORBIT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
ORBIT_MODEL_REGION=us-east-1
```

It authenticates through the ambient AWS credential chain — environment, shared
config, SSO, or an instance role — so no key goes in `.env`, and whether this
machine may call it is a question only a real call can answer.

Two things about Bedrock that are easier to read than to discover:

- **The newer Claude models need an inference profile.** A bare
  `anthropic.claude-sonnet-4-5-…` is refused with *"on-demand throughput isn't
  supported"*. It wants the `us.` or `eu.` in front.
- **An Anthropic model needs an agreement on the account.** Without one, every
  call returns *"Model use case details have not been submitted"* — which
  points at the form even when the form is already on file. What is missing is
  the agreement, and `aws bedrock create-foundation-model-agreement` restores
  it, against the **bare** model id rather than the profile.

### Checking a model before you trust it

```
pnpm verify:model
```

One real call, doing the shape of work authoring actually needs: read a page as
structure, say which control an instruction means. It prints the rate it will
use *before* it spends anything, then what came back, which model answered, and
what it cost.

```
provider=bedrock model=us.anthropic.claude-sonnet-4-5-20250929-v1:0
rate: $3/M in, $15/M out
  kept: { "control": "textbox \"Open a file by loan number\"", … }
  answered by: us.anthropic.claude-sonnet-4-5-20250929-v1:0
  tokens: 868 in, 134 out
  cost: $0.004614
```

A 200 from a provider says a key works. It says nothing about whether the model
can hold the task, which is what this asks instead.

### What a session costs

Worked out from a rate table in
[`packages/model/src/index.ts`](packages/model/src/index.ts), hard-coded so
that a rate change is a commit in a diff rather than a number moving under old
records. Claude is priced **by model family**, so the same model costs the same
however it was reached, and a cross-region inference profile is priced as the
model it routes to.

A model with no rate held is still metered in tokens, and its cost recorded as
**unknown** rather than as zero — a spend record must not assert that something
was free when nobody knows. Adding a rate is a line in that table.

Rough sizes for one authoring session, which is the only thing that spends:

| | per 1M tokens | a session |
|---|---|---|
| `gpt-4.1-mini` | $0.40 / $1.60 | ~$0.005 |
| `claude-sonnet-4-5` | $3 / $15 | ~$0.07 |

`anthropic` as a provider has no adapter and refuses at start-up; an Anthropic
model reached through Bedrock is the supported way to that.

Then:

```
scripts/orbit start
```

Five processes come up. `scripts/orbit status | stop | restart | logs <name>`.

| | |
|---|---|
| `http://localhost:5173` | Orbit |
| `http://localhost:4101` | Meridian Home Lending — the modern demo application |
| `http://localhost:3040` | Northwind Service Desk — the legacy one, which is the hard case |
| `http://localhost:4000` | the API |
| — | the worker, which holds no port |

## Your first agent, in four minutes

**1. Register the system.** `http://localhost:5173/admin` → Register an
application.

| | |
|---|---|
| Name | `Mortgage Portal` |
| Surface | browser |
| Address | `localhost:4101`, path `/` |
| Signs in as | `admin` |
| Password | anything — the demo portal accepts any value |

The password is encrypted before it is written, and nothing ever reads it back
except the worker, at the moment of a run's sign-in.

**2. Write a procedure.** `http://localhost:5173/bring-in` → Write it out.

| | |
|---|---|
| Which system | Mortgage Portal |
| Start at | `/login` |
| Call this agent | anything |
| An example to work through | name `loanNumber`, value `ML-26-04471` |

```
Sign in to Meridian Home Lending, then open the loan file. Approve the file
when the credit score is at least 620. If it is lower than that, decline the
file citing a low credit score.
```

A browser opens and Orbit works through it once, against the real application,
showing each turn as it is recorded.

**3. Confirm and publish.** Name the two conclusions, press Confirm, then
Publish a version.

**4. Run it.** Start a run with `loanNumber = ML-26-04471` — credit score 762,
so it approves. Then run it again with `ML-26-04547` — credit score 596, so it
stops at your check and says why.

The run page shows every step, what it compared, and a screenshot of what it
saw — except on a step that typed a password, where the picture is not taken
rather than taken and judged safe.

## What is in here

| | |
|---|---|
| `apps/api` | The HTTP surface and the migrations. Connects as `orbit_app`, which holds INSERT and SELECT on the immutable tables and nothing else. |
| `apps/worker` | Drives the browser. Authors a draft by walking a procedure, and executes a published version. Only authoring talks to a model. |
| `apps/web` | The interface. |
| `packages/contract` | The closed sets, declared once: ten step kinds, five value types, the error and event vocabularies. Unknown keys are refused. |
| `packages/credentials` | How a registered password is encrypted, shared so the API that writes one and the worker that reads it cannot drift. |
| `demo/mortgage-portal` | Meridian Home Lending. A loan origination system with nine seeded files and a set of deliberately awkward pages. |
| `docs/` | The specification, the closed decisions, what has shipped, and what is knowingly not done. |

## Working on it

```
pnpm test        # 216 tests: contract, model, api, worker
pnpm typecheck
```

Tests need `orbit2_test`, which `pnpm run setup` creates from
`ORBIT_TEST_DATABASE_URL`. Some drive a real
Chromium and some need the demo portal running on 4101; those skip themselves
with a reason rather than passing quietly when the thing they test is absent.

`docs/engineering/engineering-instructions.md` is the place to start. In short:
comments say **why**, and name the concrete failure that motivated the code;
validation happens at every boundary and refuses unknown keys rather than
dropping them; and a refusal says what is wrong in words the person reading it
can act on.

## What it deliberately will not do

- **Publish anything it cannot pin down.** A name that matches two things on a
  page identifies neither, and that is a refusal rather than a tie to break.
- **Rewrite a record.** Versions, runs, evidence and the audit trail are
  append-only — `UPDATE` and `DELETE` are revoked and a trigger refuses them
  besides, including for the database owner. That is why a published agent can
  be retired but never deleted.
- **Let anyone type a locator.** How a step finds things is derived from
  Orbit's own view of the page, by a ladder ordered by how often each rung is
  measurably wrong.
- **Consult a model when it runs.** Authoring is model-driven and execution is
  not; the worker executes with no model key set at all.

`docs/pilot-readiness.md` is the honest list of what stands between this and a
real pilot. `docs/TODO.md` is what is understood and deliberately not done.
