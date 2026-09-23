# Orbit 2.0

Turns a written business procedure into an agent that executes it against a
real business application, and leaves evidence.

The claim the whole thing is built to support: **tell what the agent did, and
be sure it could not have done anything else.**

---

## Getting it running

You need **Node 22.6 or newer** and **pnpm**. For green screens, the **s3270**
emulator (`brew install x3270`, or `apt install s3270`); without it every web
agent works as before and a green-screen agent is refused at publication. A PostgreSQL too — but if you
have not got one and Docker is running, setup starts the one in
`docker-compose.yml`. No postgres client is needed either; Orbit creates and
migrates its databases through the driver it already ships with.

Two commands, and the second is the one you use every day:

```
git clone git@github.com:thecloud22/orbit2.git
cd orbit2
pnpm run setup        # once
scripts/orbit start   # every time
```

(`pnpm run setup`, not `pnpm setup` — pnpm has a built-in command by that name
which manages pnpm's own installation, and it wins. `scripts/setup` still
works too.)

Setup checks what is installed, writes `.env` from `.env.example`,
installs the workspace and Chromium, creates `orbit2_dev` and `orbit2_test`,
and runs the migrations on both. It is safe to run twice.

Both commands make sure something is listening where `.env` says the database
is. A server that already answers is left alone — a local PostgreSQL, or one
in a data centre, is not something Orbit should start a container underneath.
Only a machine with nothing there gets the container, and only if Docker is
running.

**If you already run PostgreSQL yourself**, setup's first guess is a local one
answering as you. If that is wrong, edit the three `ORBIT_*DATABASE_URL` lines
in `.env` and run setup again; `.env.example` shows what a containerised one
looks like. If it cannot reach them it stops and says which address it tried.

**If port 5432 is already taken** by your own PostgreSQL and you want the
container as well, set `ORBIT_PG_PORT` to something else and point those three
URLs at it.

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

Six processes come up. `scripts/orbit status | stop | restart | logs <name>`.

| | |
|---|---|
| `http://localhost:5173` | Orbit |
| `http://localhost:4101` | Meridian Home Lending — the modern demo application |
| `http://localhost:3040` | Northwind Service Desk — the legacy one, which is the hard case |
| `tn3270://localhost:3271` | Loan Servicing — the mortgage portal's green-screen twin, the same nine files over TN3270 |
| `http://localhost:4000` | the API |
| — | the worker, which holds no port |

## Your first agent, in five minutes

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

**2. Bring a procedure in.** `http://localhost:5173/bring-in` → Write it out.
Paste `docs/testing/scenarios/09-live-edit.txt`, start at `/login`, and give
`loanNumber` = `ML-26-04561` as the example. (Or tick *Start from a blank page*
and write it on the agent's page.)

**3. On the agent's page.** Everything happens on one page. Your procedure is on
the left, as you wrote it, with Orbit's sentence numbers in the margin; what
Orbit made of each sentence opens in the panel beside it.

- Orbit sorts every sentence: *Orbit does this*, *A rule*, *For a person*,
  *Background*, *Orbit won't*. Change any with **Edit**, or ask in the **Chat**.
- **Confirm and draft it.** Orbit works through the application, and you watch
  each turn and the page it is looking at.
- Each sentence now shows the values it uses and finds, as objects — a `loan`
  with its `ltv`. Its steps open in the panel, each said in words, naming what it
  acts on ("the field labelled “Loan number”"), with a small picture Orbit
  captured of the page and the element boxed. Steps built from a rule carry the
  rule's identifier, **BR1**.
- A question Orbit could not settle sits under its sentence, with the picture.
  Answer it there.

**4. Confirm and publish.** Name the endings, press Confirm, then *Publish a
version*.

**5. Run it.** Start a run with `ML-26-04561` (loan-to-value 85%): it attaches
the mortgage-insurance condition and approves. Then `ML-26-04471` (72.7%): it
approves with no condition.

**6. Change it.** Press *Edit for a new version*, **Edit** sentence 5, and make
the threshold 90%. Only that sentence waits to be mapped. Press *Map changes*:
Orbit replays the earlier steps without a model and maps just the change. Confirm,
publish version 2, and `ML-26-04561` now approves with no condition. Runs of
version 1 are untouched.

Every run page shows, beside each sentence of the procedure, what the run did:
values found, which way each rule went, what it pressed, what it left to a
person — with the run's own screenshots.

## The demo, end to end

Five scenarios against the mortgage portal, run the way a person runs them —
brought in, sorted, confirmed with no relabelling, drafted, published, and every
loan checked by what the run actually pressed:

```
node scripts/scenarios.mjs demo     # scenarios 5 to 9, about 25 minutes
pnpm test:scenarios                 # all twelve
```

| # | Scenario | What it shows |
|---|---|---|
| 5 | First-time buyer review | a rule with two conditions over text; mortgage insurance and reserves |
| 6 | Property risk review | a flood zone "anything other than X", a condo rule, program-specific credit floors |
| 7 | Income and loan size | a money threshold (jumbo), self-employed tax returns, a DTI referral |
| 8 | Broker rate enquiry | read-only; the outputs handed back as objects |
| 9 | A live edit | publish, run, change the threshold on the page, map only the change, version 2 decides differently |

They call the model `ORBIT_MODEL` names, so they cost a few cents. What each
procedure says and which loan should conclude how is in
`docs/testing/scenarios/README.md`.

## Green screens, and the swivel chair

Orbit drives a TN3270 green screen as a second **connector**, beside the
browser, and an agent can work across both — the swivel chair: read the web
file, key it into the mainframe, bring the answer back.

**Register it.** Admin → Register an application → Connector: *Terminal ·
TN3270*. Host `localhost:3271`, no TLS, code page `cp037`, screen `3278-2`,
signs in as `ADMIN`, any password. (A real host is TLS and may need an LU name.)

**One procedure, two systems.** Bring `docs/testing/scenarios/09-live-edit.txt`
in against *Loan Servicing* instead of the web portal. Orbit signs on, types the
loan number, reads LTV off the loan-detail screen, and approves with the PF
keys — the same steps in words, found by their label on the screen.

**Across both.** Bring `12-board-the-loan.txt` in against the web portal, then
*Add an application* on the agent's page and pick Loan Servicing. Orbit places
each line on the system it happens on (change any like a label), and walks both:
it reads the file on the web, boards the loan on the green screen — asking once
how the web's *Conventional* is written there (`CONV`) — and saves the servicing
account back on the web file. A run that stops part-way says what each system
now holds, and is never run again blind.

```
node scripts/scenarios.mjs green    # scenarios 10 to 12
```

| # | Scenario | What it shows |
|---|---|---|
| 10 | Scenario 9's words, on the green screen | the same procedure and conclusions, through TN3270 |
| 11 | Existing-loan check | a decision on the web from a borrower's loans on the green screen |
| 12 | Board the approved loan | the swivel chair: web → green screen → web, with a code table |

Orbit never decodes the 3270 stream itself: it drives the s3270 emulator, one
per session. See Decisions 18 and 19.

## What is in here

| | |
|---|---|
| `apps/api` | The HTTP surface and the migrations. Connects as `orbit_app`, which holds INSERT and SELECT on the immutable tables and nothing else. |
| `apps/worker` | Drives each application through its connector — a browser, or a green screen through s3270. Authors a draft by walking a procedure, and executes a published version. Only authoring talks to a model. |
| `apps/web` | The interface. |
| `packages/contract` | The closed sets, declared once: ten step kinds, five value types, the error and event vocabularies. Unknown keys are refused. |
| `packages/credentials` | How a registered password is encrypted, shared so the API that writes one and the worker that reads it cannot drift. |
| `demo/mortgage-portal` | Meridian Home Lending. A loan origination system with nine seeded files and a set of deliberately awkward pages. |
| `demo/terminal-portal` | Two practice green screens over TN3270: a service desk on 3270, and Loan Servicing — the mortgage portal's twin — on 3271. |
| `docs/` | The specification, the closed decisions, what has shipped, and what is knowingly not done. |

## Working on it

```
pnpm test        # 403 tests: contract, model, procedure, api, worker, and the green-screen twin
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
- **Rewrite your words.** A sentence you change is kept as a revision beside what
  it said before; Orbit never rewrites one, and the chat only proposes a
  rewording for you to accept.

`docs/pilot-readiness.md` is the honest list of what stands between this and a
real pilot. `docs/TODO.md` is what is understood and deliberately not done.
