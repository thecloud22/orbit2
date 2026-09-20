# Orbit 2.0 Functional Specification

> Product requirements defining the intended user experience, workflow behaviour, automation capabilities, governance, operational controls, and evidence requirements.

**Document type:** Functional specification · **Status:** Authoritative functional contract
**Audience:** Product, engineering, QA, operations, security, compliance, business
**Technical approach:** Open — no implementation mandated

Screenshots referenced below live in `screenshots/` beside this file. The rendered version
with images inline is `index.html`; this Markdown rendering carries the same requirements
without the images, for use as a build input.

---

## 1. Product overview

### The business problem

Organisations run a large volume of repeatable back-office work that is fully described by a written procedure and performed by a person: looking a record up across two systems, checking a figure against a policy, verifying that a request reached the right queue, reading a status and recording the outcome. The procedure is well understood. The work is not difficult. It is simply done by hand, many times a day, by people who are accountable for getting it right.

Automating that work has historically forced a choice between two unacceptable options. A scripted automation is exact but opaque: the business procedure and the thing that executes diverge immediately, and nobody outside engineering can say what the automation will do. A model-driven agent is flexible but unaccountable: it decides at run time, differently each time, and leaves nothing a reviewer or an auditor can stand behind.

Orbit exists to remove that choice. It turns a written business procedure into an agent that executes it against real business applications and leaves evidence of everything it did, while the procedure itself stays readable and stays the source of intent.

> **The defining product property**
>
> Every person who touches Orbit needs the same two things: **to be able to tell what the agent did, and to be sure it could not have done anything else.** Every requirement in this specification serves one of those two sentences. Where a capability would make either one less true, Orbit refuses the capability.

### Primary user groups and business contexts

Orbit is built for business operations, not for developers. No user group in the table below is expected to write code, read a technical artefact, or describe a screen element in technical terms.

*Primary user groups and what each needs from the product*

| User group | What they do | What they need from Orbit |
|---|---|---|
| **Operations lead** (process owner) | Brings a procedure into Orbit, checks that what Orbit understood matches the real process, and takes it through to a live agent. | To recognise their own procedure in what comes back, and never to have to express anything technically. |
| **Automation designer** | Structures the workflow: steps, inputs, outputs, decisions, exception paths, and which application each step acts on. | A closed set of things a step can be, validation that explains exactly what is blocking publication, and no way to express something ambiguous. |
| **Reviewer / approver** | Reads the workflow step by step, confirms it is the procedure as the business performs it, and approves it for publication. | To see exactly what will happen before it can happen, and for nothing to change afterwards without them. |
| **Operator** | Starts runs, watches the queue, answers runs that stopped for a person, investigates and recovers failures. | To tell at a glance what needs a person, what failed, and what to do about each. |
| **Business requester** | Asks for one piece of work to be performed and reads the result. | A simple typed request form and a result they can act on. |
| **Auditor** | Reconstructs, after the fact, what a run did, what it saw, what it concluded and on whose authority. | Proof from stored records alone, without re-running anything. |
| **Platform / integration administrator** | Registers the applications, services and credentials workflows may use, and the policy text they may cite. | To grant access by naming it, never by handing a secret to a workflow author. |
| **External system / AI agent consumer** | Requests work and collects results through a governed interface. | The same permissions, validation, controls and audit trail a person is subject to. |

### The outcomes users achieve

- A written procedure becomes a running agent without anyone translating it into code.
- Work that was performed by hand many times a day is performed on request, consistently.
- Every completed piece of work carries proof of what was done, sufficient to answer a challenge months later.
- Work an agent is not permitted to complete stops safely and reaches a person, rather than being guessed at.
- A change to a business application surfaces as an explicit, diagnosed stop rather than as silently wrong output.

### The processes Orbit coordinates

Orbit coordinates procedures that span the systems a person would otherwise move between by hand: browser-based business applications, terminal-based enterprise systems, and API-accessible enterprise services. A single workflow may span all three, and the person describing it never states which — they describe the business step, and the application it is attached to determines how it is carried out.

Within those systems, Orbit performs navigation, data entry, selection, extraction, content validation, table collection, decision-making, system-to-system handoff, and evidence capture. It carries out work that reads and verifies, and it escalates work that changes a system of record unless that authority has been explicitly granted to the workflow.

### Functional scope

*What is and is not within the product's functional scope*

| Within scope | Outside scope |
|---|---|
| Turning written procedures, uploaded documents and recorded demonstrations into structured workflows. | Authoring arbitrary program code, expressions or scripts inside a workflow. |
| Executing against browser, terminal and API surfaces, with evidence captured throughout. | Interpreting a procedure at run time. What executes is fixed when a version is published. |
| Bounded AI assistance in authoring, and bounded AI decisions at run time within declared alternatives. | Open-ended model autonomy: a model never selects a control, an address, or an action. |
| Human tasks, approvals, escalation and safe hand-off at the edge of an agent's authority. | Performing an action a workflow has not been explicitly permitted to perform. |
| Governed access for external systems and authorized AI agents. | Ungoverned access of any kind: every caller is subject to permissions, validation and audit. |

---

## 2. User roles and access

Orbit is a governed system. Every action a person takes is attributable to that person, and every action a person is not entitled to take is refused with a reason.

> **These are phases of the work, not a required headcount**
>
> The roles below name **responsibilities attached to the phases of the workflow lifecycle** — bringing a procedure in, checking the draft, confirming it, testing and activating it, then running and answering for it. They are not an organisation chart, and Orbit does not require a distinct person for each one. In most deployments a small number of people hold several of them at once: one operations lead may bring a procedure in, confirm it, publish it and then run it. Orbit must therefore work when every role in the table is one person, and equally when each is a different team.
>
> What Orbit does require is that each responsibility is **separately grantable** and **separately recorded**. Who confirmed a procedure, who published a version and who started a run are three distinct facts on the record even when they name the same person. Where an organisation needs them separated, it configures separation of duties and Orbit enforces it; where it does not, the same person proceeds without obstruction and the record still says so.

### Responsibilities by phase

*Which responsibility belongs to which phase of the lifecycle*

| Phase | Responsibility in that phase | Role name used in this specification |
|---|---|---|
| **Bring it in** | Supply the procedure, as a recording, written instructions or a document. | Operations lead (process owner) |
| **Check the draft** | Correct the steps, answer the questions, confirm the assumptions, decide the exceptions, acknowledge the risks. | Automation designer; workflow reviewer |
| **Confirm the process** | Attest that this is the procedure and supply an example for each ending. | Operations lead; workflow approver |
| **Test and activate** | Publish an immutable version, prove each ending, activate it. | Workflow approver |
| **Run and answer for it** | Start work, answer runs that stop for a person, investigate and recover failures, account for what was done. | Workflow operator; business requester; auditor |
| **Across every phase** | Register the applications, services, credentials and policy a workflow may use; grant and audit access. | Platform administrator; integration administrator |

### Role permissions

*What each role may view and do*

| Role | Can view | Can do | Cannot do |
|---|---|---|---|
| **Platform administrator** | Every product area, including deployment configuration, registries and audit history. | Register applications, API systems and policy text; assign roles and ownership; configure environments, retention and policy; view every run and its evidence. | Alter a published version, alter or delete recorded evidence, or reveal a stored secret value. |
| **Automation designer** | Workflows they own or are granted, and runs of those workflows. | Create, edit, structure and validate workflows; declare inputs, outputs, decisions and exception paths; attach the workflow to a registered application; start test runs; submit for review. | Publish or activate without the required approval; register a connection or credential; read a run belonging to a workflow they are not granted. |
| **Workflow reviewer** | Workflows submitted for review, their full step detail, their validation state and their authoring history. | Read every step and what it does; insert, edit and reorder steps; answer questions; confirm assumptions; acknowledge risks; accept or reject proposed adjustments; record a review decision with a reason. | Publish, unless also granted approver; alter a version already published. |
| **Workflow approver** | Everything a reviewer can view, plus the publication and activation state. | Approve a workflow for publication; publish an immutable version; activate, pause, resume and archive an agent. | Approve a workflow they authored, where separation of duties is configured to require it. |
| **Workflow operator** | Active agents, the run queue, run history, run detail and evidence for agents they are granted. | Start a run with validated inputs; cancel, retry and re-run; answer a run waiting on a person; escalate a failure. | Edit or publish a workflow; start a version that is not active; view evidence for an agent they are not granted. |
| **Business requester** | The agents they are granted, and the runs they themselves requested. | Submit a request with validated inputs and read its result and outcome. | View another requester's run, view step-level evidence unless granted, or alter anything. |
| **Auditor** | Every workflow version, run, event, artefact, approval and administrative change, across the workspace. | Search and reconstruct any execution; export an audit record; inspect the exact version that ran and who approved it. | Change anything at all. The role is read-only by construction. |
| **Integration / credential administrator** | The connection registry, credential state, connection health and authorization status. | Register and retire connections; attach and rotate credentials; grant workflows the right to use a connection by name. | Reveal a secret value to any user or workflow, or view business evidence unless separately granted. |
| **External system** | Only what its grant names. | Start a run of a permitted agent, read the status and result of runs it started, within rate and policy limits. | Author, publish, approve or administer; read any run it did not start. |
| **Authorized AI agent consumer** | The catalogue of capabilities it is granted, described in business terms. | Discover and invoke permitted capabilities under the same validation, permission checks and audit logging as a person. | Invoke a capability outside its grant, escalate its own permissions, or act without an attributable record. |

**Required behaviour — ownership, delegation and separation of duties**

- Every workflow, connection and agent has exactly one accountable **owner**, displayed wherever that object is listed.
- An owner can **delegate** any subset of their rights to a named person for a stated period. A delegation is itself an audited act, is visible on the object, and expires without action.
- When an owner leaves, their objects are reassigned by an administrator; they are never left ownerless, and the reassignment is recorded.
- Where separation of duties is configured, the person who authored a version cannot be the person who approves it. Orbit refuses the approval and names the rule.
- High-risk actions — publishing a version that may change a system of record, promoting a workflow from a practice environment to a live one, granting a credential, widening a permission, or overriding a decision — require an approval distinct from the person requesting them.

**Required behaviour — permission-denied behaviour**

When a user attempts something their role does not permit, Orbit states which action was refused and which permission would allow it, offers the route to request that permission, and records the attempt with the actor, the target and the time. Orbit never silently hides a control in a way that leaves the user unable to tell whether the capability exists or whether they lack access: a control the user cannot use is shown disabled with its reason, and an area they cannot enter reports that it exists and is not theirs.

**Required behaviour — sensitive data and environments**

- Secret values are never displayed to any role, including administrators. Users select a credential *by name*; the value is resolved only at the moment it is used.
- A value supplied as a secret at run time is required afresh on every run, is never stored, and never appears in a run's inputs, outputs, logs, events or captured evidence.
- Execution artefacts are readable only by roles granted that agent. Every access to an artefact is itself recorded.
- Environments are separated. A workflow is built and tested against a **practice** copy of an application; reaching a **live** system requires an explicit, approved promotion, and the environment a run executed against is recorded on the run.

> ⬜ **Screenshot required — Role and permission administration.** This screenshot should show an administrator assigning roles to a named user, the resulting permission matrix, ownership and delegation controls on a workflow, and the separation-of-duties setting that prevents an author approving their own version. Capture was not possible because the inspected environment exposes no identity, sign-in or role-assignment surface, so no user record exists to display.

> ⬜ **Screenshot required — Permission-denied state.** This screenshot should show a user opening a workflow or run they are not granted, the message naming the action refused and the permission that would allow it, the control for requesting access, and the surrounding navigation proving the rest of the product remains usable. Capture was not possible because access control is not enforced in the inspected environment; every area is reachable, so the denied state cannot be produced.

---

## 3. Navigation and workspace

**Evidenced behaviour**

Orbit presents six primary areas in a persistent global navigation bar, ordered by the way work moves through them: **Home** (arrive and start something), **Studio** (author), **Agents** (run), **Runs** (observe), **Wiki** (in-product guidance) and **Admin** (registries and deployment status). The bar is present on every screen, marks the current area, and remains available from every drill-down page.

Every screen in Orbit has its own address. A user can link to a workflow, a run, a guidance topic or a specific product area, and that link resolves for anyone with permission to see it. Reload, browser back and browser forward all agree with what is on screen, and a drill-down page marks its parent area as current so the user can always tell where they are.

> 📷 **Figure 1 — Home: the ways a procedure enters the product, and what can be run now.** Home is the first screen every user sees. It answers two questions and nothing else: how do I bring a procedure in, and what is available to run right now. It deliberately carries no dashboard, because each of the other areas answers its own question in more detail.
>
> Screenshot: `screenshots/home.png`

1. **Global navigation**: the six product areas, always present, with the current one marked. Used by every role; the areas a user cannot enter are shown and reported as not theirs rather than hidden.
2. **Three creation methods**: recording a demonstration, writing the procedure out, and uploading a document. None is a fallback for the others and all three converge on the same reviewable draft.
3. **"most people start here"**: a recommendation, not a restriction. Recording is exact because the person performing the task also shows Orbit where each step happens.
4. **System chooser**: a workflow is attached to a registered application, so it is built against that application's practice copy. Until a system with a practice copy is chosen, the start control is disabled and says why.
5. **"Orbit reads this and drafts the steps. It does not open any website or system you mention, and nothing you write here can run."**: the boundary stated on the screen where it applies. Text a user pastes is read as description; it is never treated as an instruction to execute.
6. **Agents list**: the agents this user can start right now, with the version and how many runs each has had. Selecting one opens its request form.

### Finding work: search, filters and status

Lists in Orbit are built for scanning. Each list offers free-text search, filters relevant to that list, and a status indicator on every row. Filters show their result count even when that count is zero, so the absence of results is itself an answer rather than an ambiguity.

> 📷 **Figure 2 — Agents: the catalogue of what can be run, searchable and filterable by tag.** Operators and business requesters use this screen to find the agent that does the piece of work they need and to start it. Each agent carries the declared inputs it requires, so the request form is generated from the workflow rather than maintained separately.
>
> Screenshot: `screenshots/agents-roster.png`

1. **Search and tag filters**: free text matches the name, description and tags; tag chips narrow the list further. Tags are editable in place by users who own the agent.
2. **Version chip**: the exact immutable version an operator is about to start. Two versions of one agent are distinguishable here, and the run records which one executed.
3. **Declared inputs**: the request form is generated from the workflow's own declared inputs, each with its label and whether it is required. Validation is applied before a run is created.
4. **Pause, resume and archive**: an owner can stop new runs starting without altering the version, or retire the agent entirely. Archiving never deletes past runs or their evidence.
5. **Start run**: validates the inputs, creates the run, and takes the operator to the run's own page where its progress and evidence appear as they are produced.

> 📷 **Figure 3 — Studio: every workflow in progress, each carrying the same derived status it shows everywhere else.** Process owners and designers return here to continue work. Because the status is derived rather than stored, a row cannot claim a workflow is further along than it is, and a workflow that is live while being edited is distinguishable from one that is merely a draft.
>
> Screenshot: `screenshots/studio-workflow-list.png`

1. **Creation cards repeated at the top**: starting a new workflow is available from the place existing workflows are listed, not only from Home.
2. **Status chip per row**: the single derived status, identical to the one on the workflow's own page.
3. **Live marker with version**: shows at a glance which workflows have something running and which version it is.
4. **Selecting a row**: opens the workflow at the stage it has reached, rather than always at the beginning.

> 📷 **Figure 4 — Runs: every execution, grouped by agent, with the two things that need attention filterable directly.** This is the operator's primary screen. Runs are grouped by agent rather than by version, because two versions of one process are the same process to the person reading, and the comparison between them is the point of keeping a history.
>
> Screenshot: `screenshots/runs-list.png`

1. **Filter chips with counts**: *Needs a person* and *Failed* are the two states that require action, so each is one click away and shows its count even when zero.
2. **"Today"**: scoped to the reader's own day rather than to a server clock, because "did anything fail today" is a question about the reader's working day.
3. **Grouping by agent**: groups containing a failure are marked, so an unattended failure is visible without opening anything.
4. **Status badge and business outcome on every row**: the technical status and the business conclusion are shown as separate facts, never merged into one label.
5. **Selecting a row**: opens that run's detail page, with its step timeline, inputs, outputs, events and evidence.

### Empty, loading and error states

Orbit distinguishes four situations that a list must never confuse: nothing exists yet, nothing matches the current filter, the data has not arrived yet, and the data could not be loaded. Each has its own treatment. When nothing exists yet, Orbit gives a single instruction naming what to do rather than showing empty counters. When a filter matches nothing, it says so and leaves the filter visible so the user can widen it. When data cannot be loaded, Orbit reports the failure rather than rendering an empty list that reads as "you have nothing".

> 📷 **Figure 5 — A filter that matches nothing, distinguished from having no runs at all.** The filter controls stay visible and keep their counts, so the user can tell that runs exist and that their current filter excludes them. This distinction matters operationally: "nothing failed" and "your filter is wrong" demand opposite responses.
>
> Screenshot: `screenshots/runs-empty-filtered.png`

> 📷 **Figure 6 — Search narrowing the agent catalogue, with tag filters still available to narrow it further.** Search and filters compose rather than replacing one another, so a user can reach a specific agent in a large catalogue without losing the ability to widen the result again.
>
> Screenshot: `screenshots/agents-roster-filtered.png`

### In-product guidance

Orbit answers the questions that arise mid-task — what a phase requires, why a run stopped, what to do about a failure — inside the product rather than in documentation the user has to leave to find. Guidance is a first-class area with its own addresses, so a specific topic can be linked to directly from wherever the question arises.

> 📷 **Figure 7 — In-product guidance, organised by the task the reader is trying to complete.** The topics are named for what a user is doing, not for the product's internal structure. A user who has to leave the product to find an answer generally does not come back, so the answers live in the same place as the work.
>
> Screenshot: `screenshots/wiki-index.png`

> **Requirement: a partial view is never presented as a complete one**
>
> Where a screen composes several sources, Orbit loads them together and fails them together. A screen that renders one populated panel beside one blank panel whose request failed reads as a factual statement about the business — and would be a false one. Orbit reports a single failure as a single failure.

### Cross-links between product areas

The objects in Orbit are related, and the product links them in both directions: a workflow links to the version published from it and to the runs of that version; a run links to the exact version that executed and to the workflow it came from; a failed run links to the step that stopped it and to the evidence captured there; an agent links to its run history; a registered connection links to the workflows that use it. A user investigating a problem can move between these without searching.

**Required behaviour — saved views and bulk actions**

- Users can save a named view of any list, comprising its search term, filters and sort, and set one as their default. Saved views can be shared with a team.
- Lists support sorting by the columns that carry meaning: last run, status, owner, name and duration.
- Users can select multiple rows and apply a permitted action to all of them — retrying failed runs, pausing agents, re-assigning ownership, applying a tag — with a single confirmation that names the number of objects affected, and one audit record per object.
- Lists page predictably, and a filter or search applies across the whole set rather than only the page on screen.

---

## 4. Workflow lifecycle

A workflow travels a fixed path from a written procedure to a live agent, in four phases. Every transition between them is a deliberate human act: nothing advances a workflow on its own, and no automated part of Orbit may move a workflow closer to being live. The phases are the organising structure of the product — the workflow's status, the next action it offers, and who is accountable at each point all follow from which phase it is in.

1. **Bring it in** — by recording a demonstration, writing the procedure out, or uploading a document.
2. **Check the draft** — correct the steps, answer the questions raised, confirm the assumptions, decide the exceptions, acknowledge the risks.
3. **Confirm the process** — attest that this is the procedure, and give an example of the values that reach each way it can end.
4. **Test and activate** — publish an immutable version, prove each declared ending with a test run, then activate so operators can start it.

**Evidenced behaviour**

Orbit displays one derived status per workflow, in one vocabulary, everywhere the workflow appears. The status is computed from the facts the system already holds — outstanding questions, confirmation state, validation state, publication state, test results, activation — and never stored separately, so it cannot disagree with them. Alongside the status, Orbit names the single next action and what is blocking it.

> 📷 **Figure 8 — A workflow's review page: one derived status, the stage rail, and the next action.** Process owners, designers and reviewers all work from this screen. It replaces several competing progress indicators with a single answer to "where am I and what do I do next", and it states plainly that the reviewable document is never the thing that executes.
>
> Screenshot: `screenshots/review-header.png`

1. **Status chip**: the single derived status. Because it is derived, it is identical here, in the workflow list, and anywhere else the workflow is referenced.
2. **Non-executable notice**: the reviewed workflow is business intent and cannot itself run. Publication produces a separate, immutable version, and that is the only thing a run can execute.
3. **Published version reference**: names the version published from this workflow and links to it, so a reader can always reach what is actually live.
4. **Stage rail**: the guided stages with their completion state. A stage that does not apply to how this workflow was brought in is removed rather than shown empty.
5. **Actions row**: opening the published agent, copying and discarding. Which actions appear depends on the phase the workflow is in and the user's permissions.

### Workflow statuses

The status vocabulary below is complete. Each status names both what is true and what the user should do next; Orbit never shows a status that requires the reader to infer the action.

*Workflow statuses, what each means, and what it restricts*

| Status | Meaning | Next action offered | Restrictions while in this status |
|---|---|---|---|
| **Draft — needs your input** | Questions, assumptions, exceptions or high risks are outstanding. | Go to the first outstanding item. | Cannot be confirmed, published or run. |
| **Draft — ready to confirm** | Everything Orbit asked for has been supplied. | Confirm this is the process; supply an example value per ending first if any is missing. | Cannot be published until confirmed. |
| **Confirmed** | The process owner has attested that this is the procedure, and every ending has an example. | Publish a test version. | The procedure cannot be edited without returning the workflow to draft. |
| **Needs attention** | Something is blocking the workflow that a person has to resolve: validation has failed, a required application is unavailable, or the last run stopped in a way that needs a decision before it runs again. | Look at the blocking item. | Cannot be published while the blocker stands. |
| **Ready to test** | The workflow is complete and validates. | Publish a test version. | Not yet startable by operators. |
| **Testing** | A version exists but no example has been proven against it. | Run a test for each declared ending. | Cannot be activated until at least one test run has succeeded. |
| **Ready to activate** | Tests have passed. | Activate. | Operators cannot start runs until activated. |
| **Active** | A named version is live and operators can start runs of it. | Watch runs. | The live version is immutable. Editing here changes nothing until a new version is published. |
| **Active — changes in progress** | A version is live and a newer draft is being edited. | Continue editing. | Nothing in the draft affects the live version until it is published. |
| **Paused** | New runs are prevented deliberately. | Resume. | No new run can start. Runs already in progress are unaffected. |
| **Archived** | The agent's identity is retired. | Restore. | No new run can start. Every past run and its evidence is kept exactly as it was. |

> **Requirement: a version is immutable, and a run names the version it ran**
>
> Publishing mints a new immutable version. It is never an edit of an existing one. Archiving retires an agent's identity and never deletes or alters a version. Every run references the exact version it executed, so the question "what did this run actually do" is answerable from stored records at any distance in time, including for versions no longer in use.

> 📷 **Figure 9 — A confirmed process, with an example recorded for each declared ending.** After confirmation the stage becomes a record rather than a form. The workflow is fixed as the thing the process owner attested to, and the examples recorded here are what the tests before activation are run with.
>
> Screenshot: `screenshots/review-stage-confirm-done.png`

> 📷 **Figure 10 — Discarding an unpublished workflow, confirmed explicitly.** Discarding is offered only for workflows from which nothing has been published, so it can never remove something a run depends on. Confirmation is required because the action cannot be undone.
>
> Screenshot: `screenshots/review-discard-confirm.png`

### Publishing

Publication is the gate. Orbit refuses to publish a workflow it cannot resolve completely: an incomplete step, a value no step in the workflow produces, a path that reaches no declared ending, or an instruction it does not fully understand each block publication, and the refusal names the specific blocker rather than reporting a general failure.

> 📷 **Figure 11 — Publishing an immutable version, with the declared endings and the publisher recorded.** Approvers use this panel as the final gate. The declared outcomes shown here are the complete set of business conclusions any run of this version can reach; a run cannot invent another.
>
> Screenshot: `screenshots/review-publish-panel.png`

1. **Publication summary**: what is about to become immutable, stated before the action.
2. **Declared outcomes**: every business conclusion this version can reach. This list is fixed at publication and is what run results are reported against.
3. **Publisher**: attribution recorded on the version itself, so the approval is answerable later.
4. **Publish**: mints a new immutable version, allocates its number, and makes it available to be tested and then activated. It does not by itself make the version startable by operators.

### Testing before activation

> 📷 **Figure 12 — One test case per declared ending, each proven before the agent goes live.** Activation is gated on evidence rather than on assertion. The example values were supplied when the process was confirmed, so the tests exercise the endings the process owner themselves said the procedure can reach.
>
> Screenshot: `screenshots/review-stage-test-activate.png`

1. **One case per ending**: every declared business outcome gets a test, so activation cannot happen with an untested path.
2. **Example values**: carried from the confirmation stage, so the test data is the process owner's own.
3. **Proven result**: a passed case links to the run that proved it, which keeps its full evidence.
4. **Activate**: makes the version startable by operators. Until then the version exists but is a test version, and Orbit says so.
5. **Pause and resume**: stop and restart new runs without publishing anything or altering the version.

**Required behaviour — review, approval and change history**

- A workflow can be **submitted for review** and routed to a named reviewer or group, who records an explicit approval or rejection with a reason. A rejection returns the workflow to its author with the reason attached.
- Every version carries a **change history**: what changed between this version and the last, who changed it, when, and the note they gave. Any two versions can be compared side by side.
- Workflows can be **imported and exported** in a portable form, **duplicated** as a starting point, and **restored** from archive.
- Orbit offers a library of **templates** for common procedure shapes, and a workflow can be saved as a template for reuse.
- Creating, editing, publishing, activating, pausing, archiving and restoring are each audited with the actor, the time and the affected version.

**Required behaviour — preventing an invalid version from executing**

Orbit refuses to start a run of a version that is not active, that is paused, that belongs to an archived agent, that was never approved, or that the requester is not permitted to start. Each refusal names which of those conditions applied. A run request that arrives for a superseded version is refused rather than silently redirected to the current one, because silently running something other than what was asked for is indistinguishable from running the wrong thing.

---

## 5. Natural-language procedure authoring

Most business procedures are already written down somewhere — a wiki page, a checklist in a ticket template, an email from whoever trained the last person to do the job. Orbit accepts that material as it is and turns it into a structured workflow the author reviews and corrects. It never treats the text as something to execute.

> **The boundary on interpretation**
>
> A model may **propose** structure. It never writes directly into a workflow. Everything proposed is re-checked by the same validation that guards every other workflow before anything is stored, and everything stored is presented to a person to accept, change or reject. Orbit opens no website or system mentioned in the text.

### Bringing a procedure in

**Evidenced behaviour**

Orbit offers three ways in, presented together as equals: recording a demonstration, writing the procedure out, and uploading a document. They converge on the same reviewable draft with the same validation behind it.

> 📷 **Figure 13 — The three ways a procedure enters Orbit, with the constraints of each stated on the card.** A process owner chooses based on what they already have. Each card names its own trade-off in plain language rather than leaving the user to discover it: recording is exact because a person shows Orbit where each step happens; writing is faster; an uploaded document gives every proposed step a citation back to the page it came from.
>
> Screenshot: `screenshots/home-creation-cards.png`

1. **"Record yourself doing it"**: the person performs the task once and Orbit captures the sequence of steps from what they did, so the workflow arrives already describing the real procedure.
2. **"Write down what it does"**: the author pastes or writes the procedure and Orbit proposes the steps for checking.
3. **"Upload a document"**: a document Orbit has not seen before; each proposed step carries a citation back to the page it came from, which free text cannot offer because there is no document behind it to cite.
4. **Disabled controls state their condition**: "Choose a system with a practice copy" and "Write the steps first" name what is missing rather than leaving the control inert and unexplained.
5. **The execution boundary, stated in place**: Orbit reads the text and drafts steps; it opens nothing the text mentions, and nothing written there can run.
6. **System chooser**: attaches the workflow to a registered application, which is what makes a practice copy available to build and test against.

> 📷 **Figure 14 — Uploading a document, and the citation guarantee that distinguishes it.** The card states the reason to choose this route rather than merely offering it: every step proposed from a document can be traced back to the passage it came from, and approval is blocked while anything remains uncited.
>
> Screenshot: `screenshots/home-upload-card.png`

### What Orbit understood

After interpreting a procedure, Orbit presents what it understood before presenting the steps: the goal, where the process starts, how many steps it found, how the process ends, what it had to assume, and what it needs to ask. The author's first job is to disagree with this summary if it is wrong.

> 📷 **Figure 15 — The interpretation summary: what Orbit believes the procedure is, before any detail.** This is the fastest possible check that interpretation went wrong. A process owner who does not recognise their own procedure here stops immediately, rather than discovering the mismatch twenty steps later.
>
> Screenshot: `screenshots/review-draft-summary.png`

1. **Goal, start and ending**: the three facts that, if wrong, make everything below them wrong.
2. **Step count**: an immediate signal of over- or under-interpretation against what the author expected.
3. **Questions outstanding**: how many things Orbit could not settle from the text. These block confirmation until answered.
4. **Assumptions made**: how many things Orbit filled in itself. These block confirmation until confirmed or changed.

### Questions, assumptions, exceptions and risks

Where interpretation was uncertain, Orbit says so in the place the uncertainty applies rather than in a separate report. Four distinct kinds of uncertainty are surfaced, each with its own treatment, and each blocking confirmation until it is resolved.

> 📷 **Figure 16 — A question raised against the step it concerns, with options, a free-text answer and an escape.** Questions appear beside the step in doubt, so the author answers in context. The escape option exists because a question a person genuinely cannot answer must have a route that is not a guess — answering falsely to clear a blocker is worse than recording that the answer is unknown.
>
> Screenshot: `screenshots/review-clarifications.png`

1. **The question, in the author's language**: phrased as something a business user can actually answer, not as a request for a technical value.
2. **Suggested options**: where Orbit can enumerate plausible answers, selecting one is a single click.
3. **Free-text answer**: for anything the options do not cover.
4. **Escape**: records that the question cannot be answered here, rather than forcing a fabricated answer to clear the blocker.
5. **Saving an answer**: produces the next revision of the workflow with the answer recorded; nothing is overwritten.

> 📷 **Figure 17 — Assumptions stated explicitly, each requiring confirmation or correction.** An assumption is something Orbit filled in that the text did not say. Presenting them as a list the author must clear prevents an interpretation from becoming settled fact simply because nobody noticed it.
>
> Screenshot: `screenshots/review-assumptions.png`

> 📷 **Figure 18 — Risk flags, with high severity blocking activation until acknowledged by a person.** Orbit flags instructions that are unsafe, high-impact or outside what it may do. A high-severity flag is a hard gate: the workflow cannot be confirmed while it stands unacknowledged, and the acknowledgement is attributed.
>
> Screenshot: `screenshots/review-risks.png`

> 📷 **Figure 19 — Exception paths the written procedure left undecided.** Real procedures routinely omit what happens when a record is missing or a value cannot be read. Orbit surfaces each omission as a decision the author must make, rather than choosing silently and producing an agent that behaves in a way nobody specified.
>
> Screenshot: `screenshots/review-missing-exceptions.png`

1. **The step and the situation**: which step, and which case the procedure did not cover.
2. **Edit the handling**: the author states what should happen, which becomes an explicit path in the workflow.
3. **Accept a proposed default**: a suggested handling the author can take as offered, recorded as their decision.
4. **Blocking**: while any exception is undecided, the workflow cannot be confirmed.

### Confirming the process

Confirmation is the author attesting that the structured workflow is the procedure. It is a distinct act because it has a consequence: the procedure is fixed from that point, and any later change returns the workflow to draft and requires confirming again. Confirmation also requires an example value for each way the process can end, which is what makes the later tests meaningful.

> 📷 **Figure 20 — Confirming the process, with an example for each declared ending.** The example values are not optional decoration: Orbit tests the workflow with them before it can be activated, so every declared ending is proven with the process owner's own data. The confirm control is unavailable until each ending has one, and says so.
>
> Screenshot: `screenshots/review-stage-confirm.png`

1. **The steps, restated**: what the author is attesting to, in one place.
2. **Declared endings**: every business conclusion this process can reach, named by the author.
3. **What it never does**: the actions the process is not permitted to take, stated as part of the attestation.
4. **Example per ending**: the input values that reach each conclusion, reused for every test before activation.
5. **Blockers with a link to the first**: rather than a disabled button with no explanation, Orbit names what is outstanding and takes the author to it.
6. **Confirm**: fixes the procedure, moves the workflow to testing, and is recorded as an attributed act.

### Traceability back to the source

**Evidenced behaviour**

Orbit keeps how a workflow was authored as evidence rather than as a log. Where a workflow was produced by Orbit working through a described task, the record includes each turn, what it did, why, what it was looking at, the screenshot at that moment, and what the turn cost.

> 📷 **Figure 21 — Authoring provenance kept as reviewable evidence.** A reviewer or auditor can reconstruct how a workflow came to say what it says, including every model call made while authoring it and what each one cost. This is what makes an authored workflow defensible rather than merely plausible.
>
> Screenshot: `screenshots/review-authoring-history.png`

1. **The original task**: what the author actually asked for, preserved verbatim.
2. **Turn-by-turn record**: what was done at each step and the stated reason for it.
3. **How the element was found**: the basis on which a control was identified, which is what a reviewer checks.
4. **Screenshot per turn**: what the screen looked like at that moment, so the record can be checked rather than trusted.
5. **Cost per turn**: every model call is metered and attributed, including calls that produced nothing.

**Required behaviour — document ingestion and source-linked review**

- An uploaded document is processed into readable text, and the author can watch its progress through *waiting*, *being read*, *ready* and *could not be read*, each stated plainly.
- Where a document's text cannot be read directly, Orbit reads it from the page images, and says which method was used.
- Review of an ingested procedure is presented as two panes: the source document beside the proposed workflow. Selecting a proposed element highlights the passage it came from.
- Each proposed element is marked *grounded* (a citation exists and was verified), *acknowledged* (no citation, accepted deliberately by a named person) or *ungrounded*. Approval is blocked while anything is ungrounded.
- Authors can add, inspect and remove evidence citations, giving the page, the excerpt and how strongly it supports the element.
- An image or screenshot found inside a document is evidence a reviewer reads. It is never used as a control an agent acts on.
- When AI assistance is unavailable or a spend ceiling is reached, the interpretation controls are disabled and say which of the two applies. Recording and manual authoring remain fully available.

> 📷 **Figure 22 — An uploaded document that has been read, and can now be proposed as a workflow.** The author watches the document move through being read to ready. Only once the text has been extracted does Orbit offer to propose a workflow from it, because a proposal without the text behind it would have nothing to cite.
>
> Screenshot: `screenshots/source-document-extracted.png`

1. **Original file name**: kept alongside the title so the document can be matched against the source a reviewer holds.
2. **State**: reported in plain language — waiting, being read, ready, or could not be read — and updated as it progresses.
3. **Page count**: what Orbit found to read, which is the first check that the right document was uploaded.
4. **Propose a workflow**: requests an interpretation. Each proposed step carries a citation back to the page it came from, and approval is blocked while anything is uncited.

> 📷 **Figure 23 — An interpretation that failed validation. Nothing was saved.** The interpretation produced something that did not pass Orbit's own validation, a repair attempt did not fix it, and Orbit therefore stored nothing at all rather than saving a partially valid workflow. The document remains available, and the author can try again or bring the procedure in another way.
>
> Screenshot: `screenshots/source-document-proposal-failed.png`

> **Requirement: an interpretation that does not validate is discarded, not repaired into place**
>
> Orbit validates a proposed workflow before storing any part of it. Where validation fails, Orbit attempts one repair; if that also fails, nothing is saved and the author is told so plainly. A partially valid workflow is never stored, because the parts that did validate would then carry the authority of a workflow somebody reviewed.

> ⬜ **Screenshot required — Source document beside the proposed workflow.** This screenshot should show the uploaded document rendered in the left pane with a highlighted passage, the proposed workflow in the right pane, the grounded / acknowledged / ungrounded state of each proposed element, the evidence panel listing citations with page and excerpt, the controls for adding and removing a citation, and the approval summary stating what is still blocking approval. Capture was not possible because no interpretation could be obtained: a document was uploaded and read successfully, but every attempt to propose a workflow from it produced output that failed validation, so nothing was stored and no proposed workflow exists to review beside the source. Figure 26 shows that refusal.

---

## 6. Workflow design

The workflow editor is where a procedure becomes precise. It is a structured, step-based editor rather than a free canvas, because every step must be one of a closed set of things Orbit knows how to carry out and can validate. A designer cannot express something ambiguous, and therefore cannot publish something ambiguous.

### Steps

> 📷 **Figure 24 — The ordered steps, each stated in business language with its own controls.** Designers and reviewers read and edit the workflow here. Each step describes business intent — "search for the request by its number" — and never names a technical address. How that intent is carried out follows from the application the workflow is attached to, and is not something the author states.
>
> Screenshot: `screenshots/review-steps-list.png`

1. **Position number**: the step's place in the sequence, which is what reordering changes and what the rest of the product refers to.
2. **Plain-language summary**: what the step does, in the author's terms. This is the wording that is frozen at confirmation.
3. **Per-step notes**: toned markers showing outstanding questions, unconfirmed assumptions or validation problems on that step.
4. **Move up / move down**: reordering is validated on save; a reorder that would break a dependency is refused with the reason.
5. **Edit and delete**: deletion is confirmed inline and is refused where removing the step would leave a path with no ending.
6. **Insertion points**: a reviewer can add a step anywhere. An inserted step is incomplete until it is configured, and blocks publication until it is.

> 📷 **Figure 25 — Editing one step, with a note recording why.** Editing produces the next revision rather than overwriting the current one, which is what makes it possible to say later exactly what a given run was built from.
>
> Screenshot: `screenshots/review-step-editor.png`

> 📷 **Figure 26 — The closed set of step kinds a reviewer can insert.** There is no "custom" or "script" option, and this is the point. Every step a workflow can contain is something Orbit knows how to validate, permit, execute and produce evidence for. A capability Orbit cannot stand behind is not offered.
>
> Screenshot: `screenshots/review-step-kind-picker.png`

1. **Suggested kinds first**: the kinds most likely to fit at this position, with the full set one click away.
2. **Every kind named in business terms**: what the step accomplishes, not the mechanism by which it is carried out.
3. **No free-form option**: the absence of an "arbitrary code" choice is a product guarantee, not a gap.
4. **Inserting**: places the step at the chosen position and marks it as incomplete until it is configured, which blocks publication.

> 📷 **Figure 27 — The whole drafting stage: values, steps, and everything still outstanding, in one place.** This is where a designer spends most of their time. Everything that blocks the workflow from progressing is visible in this one stage, so the designer is never hunting for what is holding them up.
>
> Screenshot: `screenshots/review-stage-check-draft.png`

### Sections and orientation in long workflows

> 📷 **Figure 28 — Steps grouped into named sections that match how the business describes the procedure.** A twenty-step procedure is read as four or five phases by the people who perform it. Sections let the workflow be read the same way, and a section is a run of consecutive steps rather than a loose tag, so the grouping always matches the order of execution.
>
> Screenshot: `screenshots/review-sections.png`

> 📷 **Figure 29 — An outline of a long workflow, marking the steps that need attention.** For workflows beyond a handful of steps this rail is how a reviewer navigates and how they see, at a glance, which steps are still outstanding.
>
> Screenshot: `screenshots/review-step-outline.png`

### Inputs, outputs and values

A workflow declares what it needs before it runs and what it publishes when it finishes. Both are typed and named, and both are validated: a run cannot be started without valid values for every required input, and a workflow cannot declare an output nothing produces.

> 📷 **Figure 30 — Declared run inputs, which become the request form an operator fills in.** Declaring an input here is what produces the operator's request form, so the two cannot drift apart. Values are referenced by name in the steps that use them.
>
> Screenshot: `screenshots/review-inputs-panel.png`

> 📷 **Figure 31 — Declaring a new typed input.** An input is declared once, with a name the steps refer to and a label the operator sees. Declaring it here is what makes it appear on the request form and what allows a step to reference it.
>
> Screenshot: `screenshots/review-inputs-form.png`

> 📷 **Figure 32 — Declared outputs, which are what a completed run publishes to its requester.** Outputs are the business result of the work. A run reports them on its own page and returns them to whatever started the run.
>
> Screenshot: `screenshots/review-outputs-panel.png`

> **Requirement: values are referenced, never computed**
>
> A workflow refers to declared inputs, values it extracted, and named credentials. It performs no arithmetic and evaluates no expression. Where a business rule needs a comparison, Orbit offers a comparison — greater than, at least, less than, at most, equal to, not equal to — between two values the run already holds. A rule requiring two conditions is expressed as two decisions in sequence. Orbit reads figures that a system of record computed and stands behind; it never becomes a second calculator beside it, and a comparison against a value no step in the workflow reads is refused when the workflow is published rather than derived at run time.

### Decisions, branches and business rules

> 📷 **Figure 33 — Business rules as explicit decisions, each showing how it resolves.** A reviewer can read every branching rule in the workflow in one place, in business terms, and see for each one whether it resolves by comparing values the run already holds or by asking a model. That distinction is the single most important thing a reviewer needs to know about a decision.
>
> Screenshot: `screenshots/review-rules-panel.png`

1. **The rule in business language**: the condition as the business states it, not as a technical expression.
2. **How it resolves**: a comparison of two values the run holds, or a judgement by a model. Both are labelled.
3. **The operands and operator**: for a comparison, exactly what is compared against what, so a reviewer can verify the rule without running it.
4. **Counts at the panel head**: how many decisions the workflow contains, and how many of them ask a model.

**Required behaviour — control flow, resilience and dependencies**

- Designers configure **retries** per step: how many attempts, the delay between them, and which failure kinds are worth retrying. Failures that will not improve on repetition are not retried.
- Designers configure a **timeout** per step and a wall-clock deadline for the run as a whole, and state what happens when either is exceeded.
- Workflows express **loops over collections** — repeating a group of steps for each row of a collected table — with an explicit bound on the number of iterations.
- Workflows express **exception paths** and **escalation**: when a step fails in a stated way, the run follows a named path, which may end in a hand-off to a person or a declared business outcome.
- Workflows contain **manual steps** and **approval checkpoints** which pause the run, assign work to a person or group, and continue on their response.
- Steps can be **disabled** without deletion, so a designer can exclude a step while diagnosing without losing it.
- Orbit shows the **dependencies** between steps: which step produces a value another consumes. A reorder or deletion that would break a dependency is refused and names it.

**Required behaviour — editing safety**

- Unsaved edits are preserved across navigation within the product, and the user is warned before leaving a screen with unsaved work.
- When two people edit one workflow at once, the second save is refused rather than silently overwriting the first. Orbit reports who else changed it, shows what changed, and offers to reload before re-applying.
- When a user is editing a workflow that has been superseded, Orbit says so before accepting further edits.

**Evidenced behaviour — validation state is always explicit**

Orbit never leaves a user looking at an inert control with no explanation. Every blocked action states its blocker, in the place the blocker can be resolved, and links to it where the blocker is elsewhere. The exception, risk and confirmation figures in §5 each show this pattern applied to a different kind of incompleteness.

---

## 7. Automation capabilities

> **The surface a step runs on follows from the application, never from the step**
>
> A step that enters a value is business intent whether the field is on a web page or on a terminal screen. The step says what the business does; the registered application the workflow is attached to determines how it is carried out. A designer therefore never chooses a "browser step" or a "terminal step" — they describe the work, attach the workflow to the application, and Orbit carries the work out on that application's surface.

### Capability summary

*Automation surfaces: how each is configured, what it produces, and what it retains*

| Surface | How a designer configures it | Input and output | Failure behaviour | Evidence retained |
|---|---|---|---|---|
| **Browser applications** | Attach the workflow to a registered browser application; the designer states each step as business intent. | Declared inputs entered into named fields; values read from named regions; tables collected by column heading. | Stops when the control no longer matches what was approved, when a page does not reach the expected state, when navigation fails, or when an assertion fails. Each is a distinct, named failure. | Screenshot after navigation, entry, activation and at the final state; a page snapshot after navigation and after any state-changing action; a full interaction trace for every run. |
| **Terminal / mainframe systems** | Identically: attach the workflow to a registered terminal application. The authoring experience does not differ. | Values typed into addressed fields; keys sent; screen content read; expected screens asserted. | Named failures for connection refused, timeout, field not found and unexpected screen. | The screen text at each step, retained with the run. |
| **APIs and enterprise services** | Map the step to a named operation from a registered service contract. | Inputs supplied from declared values; named fields of the response mapped into workflow values. | Named failures for a failed request and for a response that does not match the declared contract. | A record of the exchange, with sensitive headers removed by name. |
| **Files and generated output** | Declare the collection to gather and the output to produce. | A collected table in, a downloadable spreadsheet out. | Stops when the collection cannot be resolved uniquely. | The generated file, retained with the run and downloadable from it. |
| **Work requiring a person** | Add a step that stops for a person, stating what must be done. | The request to the person, and their confirmation. | The run holds at *waiting* indefinitely rather than failing or guessing. | The request, the responder, the time, and the state of the run at the pause. |

**Required behaviour — surfaces and operations not yet evidenced**

- **Desktop applications.** Orbit automates approved desktop applications through visible interface interactions — navigation, entry, extraction, error detection — and hands work to an operator when the application cannot proceed safely.
- **Email and notification-driven work.** Orbit sends notifications from a workflow and reads from an approved mailbox, with the message retained as evidence.
- **Databases and data operations.** Orbit runs approved, parameterised queries against registered data sources. Parameters come from declared values; free-form query text authored inside a workflow is not offered.
- **Files and folders.** Orbit reads from and writes to approved locations, and uploads and downloads files as part of a workflow, retaining what was transferred.
- **State-changing operations.** Where a workflow is granted authority to change a system of record, that authority is declared on the version, approved separately, and visible on every run. Without it, a step that would change something is compiled into a hand-off to a person, and Orbit states which action it declined and why.

> ⬜ **Screenshot required — A configured desktop automation step.** This screenshot should show a step configured against an approved desktop application, the values it enters or extracts, its validation state, and the operator-intervention path for when the application cannot proceed. Capture was not possible because the inspected environment offers no desktop automation surface, so no such step can be configured.

> ⬜ **Screenshot required — Email, file and database step configuration.** This screenshot should show a step configured against an approved mailbox, file location and registered data source, including the parameters supplied from declared workflow values, the outputs mapped back, and the validation shown when a required parameter is missing. Capture was not possible because no mailbox, file or database connector is registrable in the inspected environment.

---

## 8. Integrations and connections

Everything a workflow reaches is something an administrator registered first. A workflow author selects from what has been registered; they cannot introduce a new destination, and they never handle a secret.

> **Requirement: administrators register a contract, never a secret**
>
> Registering a connection means recording where the system is, which copy of it is the practice copy, which sign-in name to use, and **the name of the credential** that supplies the password. The value itself is supplied to the deployment separately and is never entered, stored or displayed through the product. Orbit reports whether a named credential is configured; it never reports what it is.

### The connection registry

> 📷 **Figure 34 — The connection registry: what each application is, and whether its credential is configured.** Integration administrators work here. The practice and live hosts are recorded separately, which is what lets Orbit build and test a workflow against a copy and require an explicit promotion before it reaches the real system.
>
> Screenshot: `screenshots/admin-applications.png`

1. **Surface**: whether this application is reached as a web application or as a terminal system. Workflow steps do not carry this; the application does.
2. **Practice hosts and live hosts**: recorded as separate lists. A workflow is built and tested against the practice copy, and reaching the live system requires an approved promotion.
3. **Sign-in name**: the username a workflow uses, which is not a secret and is therefore shown.
4. **Credential name and state**: the name the workflow refers to, and whether the deployment currently supplies a value for it. A credential that is not set is marked, with the variable that would supply it named.
5. **Retire**: removes an application from selection without disturbing workflows that already reference it or runs that already used it.

> 📷 **Figure 35 — Registering a connection. There is no password field, by design.** The form records a contract: where the system is, which copy is for practice, who signs in, and what the credential is called. A secret cannot be entered here because Orbit does not accept one through the product surface.
>
> Screenshot: `screenshots/admin-application-add.png`

> 📷 **Figure 36 — Registered enterprise services and the operations each one publishes.** An administrator registers a service by supplying its published contract. The operations it declares become the only operations a workflow can select, and the hosts it declares become the only hosts a published version is permitted to reach.
>
> Screenshot: `screenshots/admin-api-systems.png`

1. **Declared operations**: named business operations taken from the contract, which is what designers choose between.
2. **Authorisation**: how the service is authorised, and which named credential supplies it.
3. **Refusals**: operations in the supplied contract that Orbit will not offer are counted and named, rather than silently dropped.
4. **Register**: validates the contract, derives the permitted hosts, and makes the operations selectable in the workflow editor.

> 📷 **Figure 37 — Approved policy text a workflow may cite when making a judgement.** Where a decision must be made against written policy, the policy is registered and approved here as a versioned artefact. A workflow cites an approved version, and a run refuses to proceed if the policy it pinned is not what the deployment currently holds.
>
> Screenshot: `screenshots/admin-grounding-sets.png`

**Required behaviour — connection health, authorization and recovery**

- Every connection reports a **health state**: reachable and authorised; reachable but unauthorised; unreachable; credential missing; credential expiring; credential expired. The state carries when it was last checked.
- Orbit checks connection health on a schedule and on demand, and surfaces a change in state as an alert to the connection's owner.
- When a credential is due to expire, Orbit warns its owner in advance, names every workflow that depends on it, and offers rotation without editing those workflows.
- When a credential is revoked, workflows depending on it are marked as not runnable, with the reason, before the failure is discovered by a run.
- Selecting a connection inside a workflow shows only connections the author is permitted to use, and each carries its current health so an author does not connect to something already broken.
- A connection has an owner and a permission list stating which workflows and which people may use it.
- When a run fails because a connection was unavailable or unauthorised, the failure names the connection and its state, and links to it. Recovery is retrying the run once the connection is healthy; the run is never partially re-executed by default.
- External systems and authorized AI agents reach Orbit through a governed interface that enforces the same permissions, input validation, execution controls and audit logging as the product surface, and publishes only the capabilities their grant names.

> ⬜ **Screenshot required — Connection health and credential expiry.** This screenshot should show a connection list with mixed health states — healthy, unauthorised, unreachable and credential expiring — the time each was last checked, the warning naming the workflows a expiring credential would break, and the rotation control. Capture was not possible because the inspected environment reports only whether a named credential is configured; it performs no reachability or authorisation check, so no health state exists to display.

---

## 9. AI-assisted workflow behaviour

Orbit uses AI in two places and nowhere else: while a person is authoring, to propose structure they then correct; and at run time, to decide a branch that cannot be decided by comparing values. Both are bounded, and both bounds are structural rather than advisory.

> **The four bounds on every model call**
>
> 1. **A model proposes; it never writes.** Output is re-validated by the same rules that guard everything else, and anything that fails is discarded rather than repaired into place.
> 2. **A judged decision returns a choice from a list the workflow already declares.** It cannot invent a branch, name a control, supply an address, or choose an action.
> 3. **Spend is capped before the call.** Ceilings apply across the deployment, per workflow and per run, and a call that would exceed one is not made.
> 4. **Every call is recorded** — what was asked, what came back, which model, how confident, how long it took and what it cost — including calls that produced nothing usable.

### A decision judged by a model

**Evidenced behaviour**

Where a branch depends on what a screen *says* rather than on which control is present, a workflow can declare a judged decision. The alternatives are declared by the workflow; the model selects among them, and must do so with confidence above the threshold the step declares.

> 📷 **Figure 38 — A model-judged decision, recorded in a form a stranger can audit.** This is the complete record of a decision a model influenced: which branch was taken, the confidence against the declared threshold, the model's own stated reasoning, the cost, and both sides of the exchange retained as downloadable evidence. An auditor does not have to take the conclusion on trust; they can read exactly what the model was shown and what it returned.
>
> Screenshot: `screenshots/run-judged-step-detail.png`

1. **The chosen alternative, named**: which of the workflow's declared options was selected and which branch the run continued at.
2. **Confidence against the declared threshold**: both numbers shown together. An answer below the threshold is not used, and a missing confidence is treated as a failure rather than as agreement.
3. **The model's own account**: its stated reasoning, retained verbatim and attributed to it rather than presented as Orbit's conclusion.
4. **Model, provider, latency, tokens and estimated cost**: what was actually used, so spend is attributable to the decision that incurred it.
5. **"What the judge was shown" and "What the model answered"**: both sides of the exchange kept as downloadable artefacts of the run.

> 📷 **Figure 39 — Every model call in a run, in one place.** Operators and auditors can answer "did a model influence this run, and how" without opening each step. A run in which no model was consulted shows no such panel at all, which is itself the answer.
>
> Screenshot: `screenshots/run-judged-decision.png`

> 📷 **Figure 40 — A decision that asks a model, shown beside the workflow's other rules.** A reviewer sees at the panel head how many of a workflow's decisions consult a model. That count is the first thing a reviewer needs, because a workflow with no model-judged decisions resolves identically on every run.
>
> Screenshot: `screenshots/review-judged-rules.png`

### When a model cannot be used, or answers unusably

Orbit distinguishes the ways a judged decision can fail, because they lead to different fixes and a reader must be able to tell them apart. In every case the run stops. Orbit never proceeds on an answer it could not validate, and never substitutes a default.

*Judged-decision failures and what each one means*

| What happened | What the user sees | What to do about it |
|---|---|---|
| **The answer was not one of the declared alternatives** | The run stops, naming the step and stating that the answer fell outside the set the workflow declares. | Review the decision's wording and alternatives; the question may be ambiguous as written. |
| **The answer cited something the step does not authorise** | The run stops, naming what was cited and stating that this step cites no approved policy. | Either attach the policy the decision should be made against, or correct the decision. |
| **Confidence was below the declared threshold** | The run stops, reporting the confidence and the threshold. | Route the case to a person, or reconsider whether the decision is judgeable from what the step reads. |
| **The model could not be reached** | The run stops, stating distinctly that Orbit could not ask — not that the model was unsure. | An operational fault. Retry once the provider is available. |
| **A spend ceiling was reached** | The run stops before any call is made, naming the ceiling in force. | An administrator raises the ceiling, or the work waits. The ceiling doing its job is not a defect. |
| **No judge is available in this deployment** | The run stops, stating that a judged step cannot run here at all. | Configure a provider, or replace the judged decision with a comparison. |
| **The approved policy is not what the deployment holds** | The run stops regardless of any fallback the step declares. | A deployment fault: the policy was changed underneath a published version. Restore or republish. |

> 📷 **Figure 41 — A model answer that failed validation: the run halts rather than proceeding on it.** The model returned something structurally plausible that the step did not authorise. Orbit discarded it and stopped. This is the fail-closed guarantee in operation: an unvalidated model answer never becomes a business decision.
>
> Screenshot: `screenshots/run-judged-invalid-output.png`

> 📷 **Figure 42 — A spend ceiling refusing a call before it is made.** The ceiling is checked before the call, not after it, so an unmeasurable budget prevents spend rather than permitting it. The message names the ceiling in force and states plainly that no call was made.
>
> Screenshot: `screenshots/run-model-budget-refused.png`

> 📷 **Figure 43 — The model could not be reached, reported distinctly from the model being unsure.** These two situations need different responses — one is an operational fault, the other a design problem — so Orbit never collapses them into a single message.
>
> Screenshot: `screenshots/run-judged-unreachable.png`

### Spend visibility and control

**Evidenced behaviour**

Spend ceilings are deployment configuration and cannot be changed from within the product, because a ceiling a user could raise for themselves is not a ceiling. Orbit displays what is in force and what has been spent against it, and disables the controls that would spend when a ceiling is reached, naming the ceiling as the reason.

> 📷 **Figure 44 — What the deployment is running with, and what has been spent against each ceiling.** Administrators and auditors read this to answer "what model is in force here", "how much has been spent" and "is anything in an unresolved state". Nothing on this screen is editable from the product, and it says so.
>
> Screenshot: `screenshots/admin-status.png`

1. **Model in force**: which model family and how it is reached, resolved when the deployment started.
2. **Spend per scope**: tokens and estimated cost against each ceiling, with an exhausted ceiling marked.
3. **Deployment facts**: where the product is served from and where evidence is stored.
4. **Unresolved work**: runs left in a non-terminal state by a previous process, surfaced rather than hidden, so an operator knows they exist.

**Required behaviour — AI governance**

- An administrator sets, per workflow, whether AI assistance may be used at all, and separately whether a run may consult a model.
- A judged decision declares the context it may be shown. Context outside that declaration is not sent, and the redaction applied before anything leaves the deployment is recorded with the call.
- Human-review thresholds are configurable per decision. Below the threshold, the case is routed to a person rather than failed, where the workflow declares a review path.
- A person reviewing a judged decision can **override** it, giving a reason. The override, the original answer and the reviewer are all recorded, and the run continues on the overridden branch.
- Orbit reports the rate at which judged decisions fall below threshold, are overridden, or fail, per workflow, so a decision that is not reliably judgeable can be identified and redesigned.
- When AI assistance is unavailable, every non-AI capability remains fully usable, and the AI-dependent controls state which of "not configured" and "ceiling reached" applies.

> ⬜ **Screenshot required — Low-confidence routing, human review and override.** This screenshot should show a run held for review because a judged decision fell below its threshold, the reviewer's view of what the model was shown and what it answered, the controls for confirming or overriding the decision, the required reason field, and the resulting record attributing the override. Capture was not possible because the inspected environment stops a run on a below-threshold answer and offers no review-and-override path, so the reviewing state cannot be produced.

---

## 10. Testing, debugging and execution

### Starting work

**Evidenced behaviour**

An operator or requester starts a run from the agent's own entry in the catalogue. The request form is generated from the workflow's declared inputs, values are validated before a run is created, and the run is then followed on its own page.

**Required behaviour — every way work begins**

- **Manually**, by a person with validated inputs.
- **On a schedule**, with the schedule, its time zone, its input values and its owner visible on the agent, and a history of each firing.
- **On an approved event** from a registered source, with the event payload mapped onto declared inputs and rejected if it does not satisfy them.
- **By an authorized external request**, subject to the same permissions, validation and limits as a person, and attributed to the calling system.
- **By an authorized AI agent**, through the same governed interface, with the same audit record.
- Every route produces a run that is indistinguishable in its evidence except for the recorded trigger and the actor that caused it.
- Orbit exposes **queue state**: what is waiting, what is executing, how long work has been waiting, and what is delayed beyond its expected start.
- Orbit suppresses accidental duplicates: a second identical request within a stated window is reported as a duplicate of the first rather than silently creating a second run.

### Run statuses

*Execution statuses and their user-visible meaning*

| Status | What it means to the user | What the user can do |
|---|---|---|
| **Queued** | The run has been created and is waiting to start. | Cancel it before it starts. |
| **Running** | The agent is executing. Progress and evidence appear as they are produced. | Watch; cancel; pause where the workflow permits. |
| **Waiting for a person** | The agent reached a step it is not permitted to do itself and stopped there. Nothing will change until somebody acts. | Do the work and confirm; reassign; escalate. |
| **Succeeded** | The agent completed the procedure and recorded its evidence, reaching the named business outcome. | Read the outcome, outputs and evidence; run it again. |
| **Handed to a person** | The agent did everything it was permitted to do and stopped at the edge of its authority. This is a successful run, not a failure. | Pick the work up from where it stopped. |
| **Failed** | The run stopped on a technical failure. The recorded error names the kind. | Read the error and evidence; retry; escalate; repair the workflow. |
| **Cancelled** | The run was stopped deliberately by a person, who is recorded. | Read what completed before cancellation; start again. |

> **Requirement: technical status and business outcome are never merged**
>
> A run that correctly established that a record does not exist has **succeeded** technically and reached the business outcome *request not found*. It is never shown as a failure. Each workflow declares its own business outcomes, and Orbit reports them without interpreting them: naming a conclusion is the honest thing the product can do; judging whether a stranger's business conclusion deserves a warning colour would be guessing.

> 📷 **Figure 45 — A successful run: the outcome, the values it read, and the exact version that produced them.** Operators and requesters read this to know the work is done and what it found. Auditors read the same panel for the version reference, which is what makes the run reproducible in principle and attributable in fact.
>
> Screenshot: `screenshots/run-succeeded.png`

1. **Status and business outcome together, as separate facts**: the technical result and the business conclusion, each labelled.
2. **Outputs**: the values the run published, with human-readable labels derived from their declared names.
3. **Agent version**: the exact immutable version that executed, not merely the agent's name.
4. **Run identifier**: the reference used when this run is cited elsewhere.
5. **Run-level events**: the transitions that framed the run as a whole, distinct from what happened inside any one step.

> 📷 **Figure 46 — A run page in full: status, outputs, step timeline and evidence in one view.** Everything needed to answer "what did this run do" is on one page, in decreasing order of generality: the run's conclusion first, then the steps, then the raw record for anyone who needs it.
>
> Screenshot: `screenshots/run-succeeded-full.png`

> 📷 **Figure 47 — A successful run whose business conclusion is "not found", carrying no error.** Establishing that a record does not exist is doing the job correctly. Presenting it as a failure would send an operator to investigate a system that is working, which is exactly the confusion the separation of status from outcome exists to prevent.
>
> Screenshot: `screenshots/run-not-found-outcome.png`

### Following a run step by step

> 📷 **Figure 48 — The step index beside the detail of the selected step.** A run with many steps stays readable because only the selected step's detail is shown. Evidence belonging to the run as a whole stays visible regardless of which step is selected, so it is never hidden behind a selection.
>
> Screenshot: `screenshots/run-timeline.png`

1. **Step index with status**: what ran, in order, and how each one ended. Steps not reached are marked as such rather than left blank.
2. **Surface badge**: shown only where a run actually spans more than one kind of system, so it carries information when present.
3. **Attempt number**: distinguishes a retried or replayed step from a first attempt.
4. **Detail rail**: the selected step's events, inputs, result and evidence.
5. **Run-level evidence**: artefacts belonging to the run rather than to any one step remain visible throughout.

> 📷 **Figure 49 — A decision resolved by comparing two values the run already held.** Both operands are shown exactly as they arrived. This is what makes a halted comparison fixable: almost always the screen showed something the workflow did not expect, and the raw values say so.
>
> Screenshot: `screenshots/run-step-comparison.png`

### Evidence

**Evidenced behaviour**

Evidence is a product feature, not diagnostic output. Every run persists enough to reconstruct what happened from stored records alone, without re-running anything.

*What every run records, and what each record answers*

| Recorded | What it tells the reader |
|---|---|
| The exact version reference | Precisely which immutable workflow executed. |
| Validated input values | What the agent was asked to do, and by whom. |
| Run and step status transitions | How far it got, and in what order. |
| Structured events | Each navigation, entry, activation, extraction and assertion result. |
| Screenshots | What the screen looked like after navigation, entry, activation, and at the final state. |
| Page snapshots | The content behind the screenshot after navigation and after any state-changing action. |
| A full interaction trace | The whole session, for every run, always. |
| Screen text (terminal work) | What the terminal displayed at each step. |
| Service exchange records | What was requested of a service and what it returned, with sensitive headers removed by name. |
| Model call records | What a model was shown, what it answered, its confidence, the model used and the cost. |
| Extracted values | What a successful lookup actually read. |
| Generated files | Any output the run produced, downloadable from the run. |
| Typed error data | For a failure, which kind of failure it was and what was being attempted. |
| Artefact metadata and integrity digests | What each artefact is, how large, and a digest proving it has not changed. |

> 📷 **Figure 50 — Evidence opened in place: the screen as it was at that step.** A screenshot is previewed inline; larger artefacts are downloaded. Each entry carries its size, type and integrity digest, so a reader can tell that what they are looking at is what was captured.
>
> Screenshot: `screenshots/run-evidence-screenshot.png`

1. **Inline screenshot**: the state of the screen at that step, viewable without leaving the run.
2. **Integrity digest**: proves the artefact is unaltered since capture.
3. **Download controls**: page snapshots, traces and generated files are retrieved rather than previewed.
4. **Evidence for the run as a whole**: kept separate from step evidence and always visible.

> 📷 **Figure 51 — The structured event stream behind the timeline, available but not in the way.** The timeline is the readable view; the event stream is the complete one. It is collapsed by default and expanded when an investigation needs it.
>
> Screenshot: `screenshots/run-raw-events.png`

### Work that stops for a person

> 📷 **Figure 52 — The work queue: runs that cannot continue until a person acts.** This panel sits above the run history because a waiting run is work, not history. It renders nothing at all when nothing is waiting, so its presence is itself the signal.
>
> Screenshot: `screenshots/runs-waiting-on-you.png`

1. **The request**: what the run needs a person to do, stated by the workflow in its own words.
2. **Context**: what the run had established when it stopped, so the person can act without opening the run.
3. **Confirm**: records that the work was done and by whom, and the run continues from that point.
4. **Waiting is not failure**: the run is intact and holds indefinitely. Nothing times out into a wrong answer.

> 📷 **Figure 53 — A run paused at the edge of the agent's authority.** The status is presented as needing attention rather than as progress, because nothing will change until a person acts. A run that reads as "in progress" while sitting untouched for days is a run nobody picks up.
>
> Screenshot: `screenshots/run-waiting.png`

> 📷 **Figure 54 — A run that stopped for a person and continued, with both attempts recorded.** Resuming replays what can be safely repeated and records a second attempt rather than rewriting the first. The pause, the responder and both attempts all remain in the evidence.
>
> Screenshot: `screenshots/run-step-person.png`

**Required behaviour — controlling a run in flight**

- An operator can **cancel** a queued or running run. Cancellation is cooperative: the run stops at the next safe boundary rather than mid-action, and records who cancelled it and what had completed.
- An operator can **pause** and **resume** a run where the workflow declares it safe, and a paused run survives a restart of the platform.
- **Retry** re-attempts a failed step within the same run where the failure kind is retryable; **re-run** starts a fresh run with the same inputs and links it to the original.
- A run interrupted by a platform restart is **reconciled** on recovery: it is either resumed or failed with a typed error and an event, never left indefinitely in an unresolved state.
- Where a run completes part of its work and cannot complete the rest, Orbit reports **partial completion** explicitly, naming what was and was not done, rather than reporting success or failure for the whole.

**Required behaviour — test mode and debugging**

- A **test run** is marked as such throughout, executes against the practice copy, and is excluded from operational success metrics.
- **Test data sets** are saved per workflow, one per declared ending, and reused for every test.
- A **dry run** validates the whole workflow — permissions, connections, declared values, reachability of every ending — and reports what would happen without acting on any system.
- **Step-through execution** lets a designer advance one step at a time, inspecting the values held and the screen after each.
- A **preview** shows, before any run, which systems the workflow will reach, which credentials it will use and which endings it can produce.

> ⬜ **Screenshot required — Step-through execution and the dry-run report.** This screenshot should show a designer advancing a workflow one step at a time with the values held after each step, alongside a dry-run report listing the systems the workflow would reach, the credentials it would use, the endings it can produce, and any validation that would block it. Capture was not possible because the inspected environment executes a run to completion once started and offers no step-through or dry-run control.

---

## 11. Monitoring and operations

The operator's question is never "what happened" in general. It is "what needs me right now", followed by "why", followed by "what do I do about it". Orbit's operational surfaces are arranged in that order.

**Evidenced behaviour**

The run history is grouped by agent, newest first, with the two states that require action — work waiting on a person, and failures — available as one-click filters that carry their counts. A group containing a failure is marked, so an unattended failure is visible without opening anything.

> 📷 **Figure 55 — Failures isolated in one click, grouped by the agent that produced them.** Grouping matters operationally: five failures in one agent is a broken workflow or a changed screen, while five failures spread across five agents is usually a failing connection. The grouping makes that distinction visible before anything is opened.
>
> Screenshot: `screenshots/runs-list-failed-filter.png`

1. **Failed filter with its count**: the count is shown even when zero, so "nothing failed" is a positive answer rather than an absence.
2. **Marked groups**: an agent with any failure is marked, which is how a recurring problem becomes visible as a pattern.
3. **Failure summary on the row**: enough to triage without opening the run.
4. **Selecting a row**: opens the run with its error, the step that failed, and the evidence captured at that moment.

> 📷 **Figure 56 — Searching execution history.** Investigating a specific piece of work — a particular request number, a particular agent — starts here, and the result keeps the filters available so a search can be narrowed further.
>
> Screenshot: `screenshots/runs-search.png`

### Investigating a failure

> 📷 **Figure 57 — A typed technical failure, naming the kind of failure and the step.** Failures are typed rather than free text, so an operator can tell a missing control from a timeout from an assertion that did not hold — three problems with three different responses. All the evidence captured before the failure is retained.
>
> Screenshot: `screenshots/run-technical-failure.png`

1. **Error kind**: a named classification, not a message to be interpreted.
2. **Message**: what specifically was being attempted and what was not found or did not hold.
3. **Failed step**: where in the procedure it stopped, linking to that step's own evidence.
4. **Evidence retained**: everything captured up to the failure remains, including the screenshot and page snapshot taken at the moment it stopped.

> **Requirement: halt rather than act on something Orbit cannot confidently identify**
>
> When a business application changes underneath a published version, Orbit stops rather than proceeding on a best guess. It captures what the screen showed at that moment, reports what it could not confidently identify, and marks the workflow as needing attention so the change is visible to its owner before the next run rather than after it. Orbit never substitutes a different control, field or operation for the one the published version calls for — a halted run is recoverable, and silently wrong output is not.

**Required behaviour — diagnosing and repairing a change**

- A run halted by a changed application reports **what changed**, not merely that something did, and links to the step and the evidence captured there.
- Orbit **groups** halts of the same kind on the same step of the same workflow as one problem with a count, so a change to an application reads as one incident rather than as many unrelated failures.
- Where Orbit can determine how to accommodate the change, it **proposes** the adjustment to a person and never applies one. A proposal states its own reasoning and its own limits, and says plainly whether a model was involved in producing it.
- Accepting a proposal does not publish it and does not rescue the run that discovered the problem. A person publishes a new version before any run uses the change.
- A proposal that has been overtaken by an edit to the workflow is **withdrawn** rather than adjusted to fit, and accepting it is refused.
- Where Orbit cannot determine the adjustment with confidence, it proposes nothing and says so, rather than offering a plausible guess.

> ⬜ **Screenshot required — Diagnosis of a changed application and the proposed adjustment.** This screenshot should show a run halted because the application changed, the diagnosis naming what it could not confidently identify, the evidence captured at that moment, the proposed adjustment with its reasoning and whether a model produced it, and the accept and dismiss controls together with the statement that accepting does not publish. Capture was not possible because the inspected environment expresses this behaviour in terms of a mechanism this specification does not require, so no screen representing the requirement as stated here exists to capture.

### Deployment health

> 📷 **Figure 58 — The administration area: a health strip above the registries, status and reference tabs.** Administrators start here. The health strip summarises the state of the deployment at a glance, and the tabs separate what is registered from what is running from what is reference material.
>
> Screenshot: `screenshots/admin-registries.png`

**Required behaviour — operational visibility**

- **Workflow health** per agent: success and failure rate over a chosen period, the most common failure kinds, average and worst duration, and the trend of each.
- **Throughput and queue depth**: how much work is completing, what is waiting, and what has waited longer than expected.
- **Recurring-failure detection**: Orbit groups failures of the same kind on the same step of the same agent, reports them as one problem with a count, and escalates when the count or rate crosses a configured threshold.
- **Alerting** on: a run failing, a workflow's failure rate crossing a threshold, work waiting on a person beyond its due time, a connection becoming unhealthy, a credential expiring, a spend ceiling approaching, and a queue growing beyond a threshold.
- **Notification subscriptions** per user and per team, by agent and by event kind, delivered to the channels the deployment has configured, with each notification linking to the run or object concerned.
- **Operator accountability**: every operator action — starting, cancelling, retrying, answering a waiting run, accepting a repair — is attributed and appears on the object it affected.
- **Export** of a filtered run history for reporting and reconciliation.

> ⬜ **Screenshot required — Operational dashboard, alert rules and notification settings.** This screenshot should show success and failure rates per workflow over a period, duration and throughput, queue depth and delayed work, a recurring-failure group with its count and escalation state, the alert rules in force with their thresholds, and a user's notification subscriptions. Capture was not possible because the inspected environment reports individual runs only; it computes no rates, holds no alert rules and has no notification channel, so none of these surfaces exists to capture.

---

## 12. Governance, compliance and auditability

Orbit's governance claim is narrow and testable: for any completed piece of work, a person who was not present can establish what was done, by which version, on whose authority, what the agent saw at each step, what it concluded, and what it could not have done. Everything in this section serves that sentence.

### Version traceability

**Evidenced behaviour**

A published version is immutable. Every run names the exact version it executed. The reviewable workflow and the executable version are separate objects, and the product says so on the workflow itself, so nobody mistakes a draft for the thing that runs.

> 📷 **Figure 59 — The stages a workflow has passed, which is also the record of what was done to it.** Each completed phase represents an attributable human act — confirming the process, publishing it, testing it, activating it. The rail is both a navigation aid and a summary of the governance steps already satisfied.
>
> Screenshot: `screenshots/review-setup-rail.png`

### Authoring provenance as evidence

How a workflow came to say what it says is kept as evidence rather than as a log, and is readable by a reviewer and an auditor. Where a model was involved in authoring, every call is recorded with what it was asked, what it returned, what it cost, and what it was looking at — including calls that produced nothing usable. Figure 24 shows this record.

### Evidence integrity and retention

**Evidenced behaviour**

Every artefact carries its size, type and an integrity digest. Orbit verifies an artefact against its digest when serving it, and reports a mismatch as an integrity failure rather than serving content that may have changed.

**Required behaviour — audit history and administrative control**

- A single, searchable **audit history** covers every attributable act: workflow created, edited, confirmed, submitted, approved, rejected, published, activated, paused, archived, restored; run started, cancelled, retried, answered; adjustment proposed, accepted, dismissed; connection registered, edited, retired; credential attached, rotated, revoked; role granted, delegated, expired; policy changed; artefact accessed.
- Each entry records the actor, the time, the object, what changed, and the reason where one was required. The actor is established by the platform, never supplied by the caller.
- The audit history is **append-only and tamper-evident**, and each entry is linked to the run and step it concerns where applicable.
- Auditors can filter by actor, object, action, outcome and period, and export the result.
- **Retention** is configurable per evidence class and per workflow, with a minimum enforced for regulated processes. Orbit reports what will expire and when, and records each expiry as an audited event rather than deleting silently.
- **Environment separation** is enforced: practice and live are distinct, a version is promoted between them by an approved act, and every run records which environment it executed against.
- Administrative policy configuration covers approval requirements, separation of duties, retention, spend ceilings, which surfaces a workspace may reach, and whether a workflow may be granted authority to change a system of record.

**Required behaviour — sensitive data in evidence**

Evidence is captured for accountability, which makes it exactly the place sensitive values must not appear. Orbit applies redaction before an artefact is stored, not after: values supplied as secrets, fields declared as sensitive, and headers named as confidential are removed from screenshots, page snapshots, interaction traces, service exchange records, events and logs. Where a value cannot be redacted with confidence, the artefact is withheld and the run records that it was withheld and why — an unreadable artefact is recoverable, and a leaked credential is not.

> ⬜ **Screenshot required — Audit history, workflow change history and retention configuration.** This screenshot should show the searchable audit history filtered by actor and period with attributed entries, a workflow's version-to-version change history with the author and note for each change, a side-by-side comparison of two versions, and the retention policy in force per evidence class with what is due to expire. Capture was not possible because the inspected environment has no identity, so actions are not attributable to a named person, and it holds no retention policy or cross-version comparison to display.

> 📷 **Figure 60 — Administrative reference material, including ownership.** Ownership is where accountability for each object is recorded and reassigned. It is administrative rather than operational, and is kept apart from the registries an administrator edits day to day.
>
> Screenshot: `screenshots/admin-reference.png`

---

## 13. Errors and edge cases

Orbit's behaviour when something is wrong is a product requirement, not an implementation detail. Three rules hold across every case in this section:

1. **Refuse rather than guess.** Where Orbit cannot establish what was intended, it stops and says what it could not establish.
2. **Name the kind.** Failures are typed, because a missing control, a timeout and a refused authorisation need three different responses.
3. **Keep the evidence.** A failure retains everything captured up to the moment it stopped. A failed run is frequently the most valuable run to be able to read.

### Authoring and configuration

*Failures while building a workflow*

| Situation | What the user sees | What Orbit records | Effect | Available actions |
|---|---|---|---|---|
| Required field missing | The field is marked, with what is required, at the point of entry. | Nothing is stored. | Save is refused. | Supply the value. |
| Invalid or unsupported value | The rule that was violated, stated in the author's terms. | Nothing is stored. | Save is refused. | Correct the value. |
| Interpretation failed validation | "The draft could not be produced." (Figure 26) | The failed attempt and its cost. | Nothing at all is saved — not even the valid parts. | Try again, or bring the procedure in another way. |
| Questions, assumptions, exceptions or high risks outstanding | Each shown against the step it concerns, with a count and a link to the first. | The outstanding items on the revision. | Confirmation is blocked. | Answer, confirm, decide or acknowledge each. |
| A step is incomplete | The step is marked and the publish summary names what is missing from it. | The validation state per step. | Publication is blocked. | Complete the step's configuration. |
| A value no step produces is referenced | The refusal names the value and the step that expects it. | The validation result. | Publication is blocked. | Add the step that produces it, or remove the reference. |
| A path reaches no declared ending | The refusal names the path. | The validation result. | Publication is blocked. | Add an ending or correct the branch. |
| Two people edit one workflow | The second save is refused, naming who else changed it and what changed. | Both revisions; neither is lost. | The second save does not overwrite the first. | Reload and re-apply. |
| A workflow cannot be loaded | The failure is reported in place of the workflow, with what could not be resolved. | The failure and its reference. | The workflow is not editable until resolved. | Report the reference; the workflow's runs and evidence are unaffected. |

> 📷 **Figure 61 — A workflow that cannot be loaded, reported rather than hidden.** Orbit reports the failure in place of the workflow rather than rendering an empty editor. An empty editor would read as "this workflow has no steps", which is a false statement about the business.
>
> Screenshot: `screenshots/review-load-failure.png`

### Execution

*Failures during a run, and what happens to the run*

| Situation | What the user sees | Run behaviour | Available actions | Evidence retained |
|---|---|---|---|---|
| Input fails validation | The field is marked before the run is created. | No run is created. | Correct the input. | None; nothing happened. |
| The application changed underneath the published version | The step, and what Orbit could not confidently identify. | Stops. Not retried into the same failure. | Read the evidence; answer a proposed adjustment; publish a corrected version. | Screenshot and page snapshot at the stop, plus everything before it. |
| Something the step needs is not present at all | A named failure identifying the step and what was sought. | Stops. | Retry; correct the workflow. | Full evidence to the point of failure. |
| The screen did not reach the expected state | A named failure describing the state that was expected. | Stops. | Retry; examine the screenshot. | Full evidence to the point of failure. |
| An assertion did not hold | The assertion, what was expected and what was observed. | Stops. | Investigate the source system; correct the expectation. | The assertion result and the screen at that moment. |
| Navigation failed or a timeout elapsed | A named failure distinguishing the two. | Stops; retried first where the workflow declares retries. | Retry; check the registered connection's health. | Full evidence to the point of failure. |
| A terminal system refused connection, timed out, or showed an unexpected screen | Three distinct named failures. | Stops. | Retry; check the host. | The screen text at the point of failure. |
| A service request failed, or its response did not match the contract | Two distinct named failures. | Stops. | Retry; check the registered contract. | The exchange record, with sensitive headers removed. |
| A comparison could not be made | Both values as they arrived, and why they could not be compared. | Stops. | Correct what the step reads. | The values and the screen they came from. |
| A judged decision failed | One of seven distinct messages (§9). | Stops in every case. | Depends on the kind; see §9. | What the model was shown and what it answered. |
| A credential is missing or could not be resolved | The step fails naming the credential, never its value or length. | Stops. | An administrator configures the credential. | Full evidence; nothing about the secret. |
| A step would change something the workflow may not change | The run hands off, naming the action it declined. | Succeeds as a hand-off, not a failure. | A person completes the action. | The state at the hand-off and what was declined. |
| A run is cancelled | Cancelled, with who cancelled it and what had completed. | Stops at the next safe boundary. | Start again. | Everything completed before cancellation. |
| An artefact fails its integrity check | The evidence cannot be shown and says it failed verification, distinctly from being unavailable. | The run record is unaffected. | Report it; other evidence remains readable. | All other artefacts. |

> 📷 **Figure 62 — Failure detail at the level of the individual step.** The run-level error says the run failed; the step detail says what was being attempted at the moment it did. Both are needed, and Orbit keeps them distinct.
>
> Screenshot: `screenshots/run-step-error.png`

### Access, availability and recovery

*Failures of access and availability*

| Situation | Required behaviour | Permission needed to recover |
|---|---|---|
| Insufficient permission | Name the action refused and the permission that would allow it; offer the route to request it; record the attempt. | The permission named, granted by an administrator. |
| Authentication failure | Report that sign-in failed without revealing which factor was wrong; do not lock the user out of the rest of the product. | None; the user retries. |
| Authorization failure against a connected system | Name the connection and that it is unauthorised, distinctly from unreachable. | Connection administrator. |
| Expired or revoked credential | Warn before expiry naming the workflows affected; after expiry, mark those workflows not runnable before a run discovers it. | Connection administrator, to rotate. |
| An integration is unavailable or unhealthy | Show the health state and when it was last checked; fail new runs fast with that reason rather than timing out. | Operator to retry once healthy. |
| AI assistance unavailable | Disable only the AI-dependent controls, stating whether it is unconfigured or a ceiling was reached; leave every other capability working. | Administrator, to configure or raise. |
| Retry exhausted | Report that retries were exhausted, how many were attempted, and the failure of the last one. | Operator to re-run; designer to repair. |
| Partial completion | Name what was completed and what was not, rather than reporting success or failure for the whole. | Operator, to complete or escalate. |
| Interrupted by a platform restart | Reconcile on recovery: resume, or fail with a typed error and an event. Never leave a run unresolved. | Automatic; the operator is notified. |
| An approval is rejected or expires | Return the workflow to its author with the reason; on expiry, escalate to the configured fallback approver and record both. | Approver; administrator to reassign. |
| A human task cannot be assigned | Escalate to the configured fallback and record that assignment failed; never silently drop the task. | Administrator, to fix the assignment rule. |
| Orbit itself cannot be reached | Report the failure rather than rendering an empty screen that reads as "you have nothing". | None; the user retries. |

> **Requirement: an empty screen is never used to report a failure**
>
> A list that could not load and a list with nothing in it look identical if both are blank, and they mean opposite things. Orbit distinguishes nothing-yet, nothing-matching, not-loaded-yet and could-not-load in every list, and never allows one to be mistaken for another.

---

## Appendix — figure index

62 figures captured from a working build; 11 marked *screenshot required*.

| Figure | Screenshot | Product area | State illustrated | Source |
|---|---|---|---|---|
| Figure 1 | `home.png` | Navigation and workspace | Home: the ways a procedure enters the product, and what can be run now | Captured from existing build |
| Figure 2 | `agents-roster.png` | Navigation and workspace | Agents: the catalogue of what can be run, searchable and filterable by tag | Captured from existing build |
| Figure 3 | `studio-workflow-list.png` | Navigation and workspace | Studio: every workflow in progress, each carrying the same derived status it shows everywhere else | Captured from existing build |
| Figure 4 | `runs-list.png` | Navigation and workspace | Runs: every execution, grouped by agent, with the two things that need attention filterable directly | Captured from existing build |
| Figure 5 | `runs-empty-filtered.png` | Navigation and workspace | A filter that matches nothing, distinguished from having no runs at all | Captured from existing build |
| Figure 6 | `agents-roster-filtered.png` | Navigation and workspace | Search narrowing the agent catalogue, with tag filters still available to narrow it further | Captured from existing build |
| Figure 7 | `wiki-index.png` | Navigation and workspace | In-product guidance, organised by the task the reader is trying to complete | Captured from existing build |
| Figure 8 | `review-header.png` | Workflow lifecycle | A workflow's review page: one derived status, the stage rail, and the next action | Captured from existing build |
| Figure 9 | `review-stage-confirm-done.png` | Workflow lifecycle | A confirmed process, with an example recorded for each declared ending | Captured from existing build |
| Figure 10 | `review-discard-confirm.png` | Workflow lifecycle | Discarding an unpublished workflow, confirmed explicitly | Captured from existing build |
| Figure 11 | `review-publish-panel.png` | Workflow lifecycle | Publishing an immutable version, with the declared endings and the publisher recorded | Captured from existing build |
| Figure 12 | `review-stage-test-activate.png` | Workflow lifecycle | One test case per declared ending, each proven before the agent goes live | Captured from existing build |
| Figure 13 | `home-creation-cards.png` | Procedure authoring | The three ways a procedure enters Orbit, with the constraints of each stated on the card | Captured from existing build |
| Figure 14 | `home-upload-card.png` | Procedure authoring | Uploading a document, and the citation guarantee that distinguishes it | Captured from existing build |
| Figure 15 | `review-draft-summary.png` | Procedure authoring | The interpretation summary: what Orbit believes the procedure is, before any detail | Captured from existing build |
| Figure 16 | `review-clarifications.png` | Procedure authoring | A question raised against the step it concerns, with options, a free-text answer and an escape | Captured from existing build |
| Figure 17 | `review-assumptions.png` | Procedure authoring | Assumptions stated explicitly, each requiring confirmation or correction | Captured from existing build |
| Figure 18 | `review-risks.png` | Procedure authoring | Risk flags, with high severity blocking activation until acknowledged by a person | Captured from existing build |
| Figure 19 | `review-missing-exceptions.png` | Procedure authoring | Exception paths the written procedure left undecided | Captured from existing build |
| Figure 20 | `review-stage-confirm.png` | Procedure authoring | Confirming the process, with an example for each declared ending | Captured from existing build |
| Figure 21 | `review-authoring-history.png` | Procedure authoring | Authoring provenance kept as reviewable evidence | Captured from existing build |
| Figure 22 | `source-document-extracted.png` | Procedure authoring | An uploaded document that has been read, and can now be proposed as a workflow | Captured from existing build |
| Figure 23 | `source-document-proposal-failed.png` | Procedure authoring | An interpretation that failed validation. Nothing was saved | Captured from existing build |
| Figure 24 | `review-steps-list.png` | Workflow designer | The ordered steps, each stated in business language with its own controls | Captured from existing build |
| Figure 25 | `review-step-editor.png` | Workflow designer | Editing one step, with a note recording why | Captured from existing build |
| Figure 26 | `review-step-kind-picker.png` | Workflow designer | The closed set of step kinds a reviewer can insert | Captured from existing build |
| Figure 27 | `review-stage-check-draft.png` | Workflow designer | The whole drafting stage: values, steps, and everything still outstanding, in one place | Captured from existing build |
| Figure 28 | `review-sections.png` | Workflow designer | Steps grouped into named sections that match how the business describes the procedure | Captured from existing build |
| Figure 29 | `review-step-outline.png` | Workflow designer | An outline of a long workflow, marking the steps that need attention | Captured from existing build |
| Figure 30 | `review-inputs-panel.png` | Workflow designer | Declared run inputs, which become the request form an operator fills in | Captured from existing build |
| Figure 31 | `review-inputs-form.png` | Workflow designer | Declaring a new typed input | Captured from existing build |
| Figure 32 | `review-outputs-panel.png` | Workflow designer | Declared outputs, which are what a completed run publishes to its requester | Captured from existing build |
| Figure 33 | `review-rules-panel.png` | Workflow designer | Business rules as explicit decisions, each showing how it resolves | Captured from existing build |
| Figure 34 | `admin-applications.png` | Integration administration | The connection registry: what each application is, and whether its credential is configured | Captured from existing build |
| Figure 35 | `admin-application-add.png` | Integration administration | Registering a connection. There is no password field, by design | Captured from existing build |
| Figure 36 | `admin-api-systems.png` | Integration administration | Registered enterprise services and the operations each one publishes | Captured from existing build |
| Figure 37 | `admin-grounding-sets.png` | Integration administration | Approved policy text a workflow may cite when making a judgement | Captured from existing build |
| Figure 38 | `run-judged-step-detail.png` | AI governance | A model-judged decision, recorded in a form a stranger can audit | Captured from existing build |
| Figure 39 | `run-judged-decision.png` | AI governance | Every model call in a run, in one place | Captured from existing build |
| Figure 40 | `review-judged-rules.png` | AI governance | A decision that asks a model, shown beside the workflow's other rules | Captured from existing build |
| Figure 41 | `run-judged-invalid-output.png` | AI governance | A model answer that failed validation: the run halts rather than proceeding on it | Captured from existing build |
| Figure 42 | `run-model-budget-refused.png` | AI governance | A spend ceiling refusing a call before it is made | Captured from existing build |
| Figure 43 | `run-judged-unreachable.png` | AI governance | The model could not be reached, reported distinctly from the model being unsure | Captured from existing build |
| Figure 44 | `admin-status.png` | AI governance | What the deployment is running with, and what has been spent against each ceiling | Captured from existing build |
| Figure 45 | `run-succeeded.png` | Execution and evidence | A successful run: the outcome, the values it read, and the exact version that produced them | Captured from existing build |
| Figure 46 | `run-succeeded-full.png` | Execution and evidence | A run page in full: status, outputs, step timeline and evidence in one view | Captured from existing build |
| Figure 47 | `run-not-found-outcome.png` | Execution and evidence | A successful run whose business conclusion is "not found", carrying no error | Captured from existing build |
| Figure 48 | `run-timeline.png` | Execution and evidence | The step index beside the detail of the selected step | Captured from existing build |
| Figure 49 | `run-step-comparison.png` | Execution and evidence | A decision resolved by comparing two values the run already held | Captured from existing build |
| Figure 50 | `run-evidence-screenshot.png` | Execution and evidence | Evidence opened in place: the screen as it was at that step | Captured from existing build |
| Figure 51 | `run-raw-events.png` | Execution and evidence | The structured event stream behind the timeline, available but not in the way | Captured from existing build |
| Figure 52 | `runs-waiting-on-you.png` | Execution and evidence | The work queue: runs that cannot continue until a person acts | Captured from existing build |
| Figure 53 | `run-waiting.png` | Execution and evidence | A run paused at the edge of the agent's authority | Captured from existing build |
| Figure 54 | `run-step-person.png` | Execution and evidence | A run that stopped for a person and continued, with both attempts recorded | Captured from existing build |
| Figure 55 | `runs-list-failed-filter.png` | Monitoring and operations | Failures isolated in one click, grouped by the agent that produced them | Captured from existing build |
| Figure 56 | `runs-search.png` | Monitoring and operations | Searching execution history | Captured from existing build |
| Figure 57 | `run-technical-failure.png` | Monitoring and operations | A typed technical failure, naming the kind of failure and the step | Captured from existing build |
| Figure 58 | `admin-registries.png` | Monitoring and operations | The administration area: a health strip above the registries, status and reference tabs | Captured from existing build |
| Figure 59 | `review-setup-rail.png` | Governance and audit | The stages a workflow has passed, which is also the record of what was done to it | Captured from existing build |
| Figure 60 | `admin-reference.png` | Governance and audit | Administrative reference material, including ownership | Captured from existing build |
| Figure 61 | `review-load-failure.png` | Errors and edge cases | A workflow that cannot be loaded, reported rather than hidden | Captured from existing build |
| Figure 62 | `run-step-error.png` | Errors and edge cases | Failure detail at the level of the individual step | Captured from existing build |
| — | — | Access administration | Role and permission administration | Screenshot required |
| — | — | Access administration | Permission-denied state | Screenshot required |
| — | — | Procedure authoring | Source document beside the proposed workflow | Screenshot required |
| — | — | Automation capabilities | A configured desktop automation step | Screenshot required |
| — | — | Automation capabilities | Email, file and database step configuration | Screenshot required |
| — | — | Integration administration | Connection health and credential expiry | Screenshot required |
| — | — | AI governance | Low-confidence routing, human review and override | Screenshot required |
| — | — | Execution and evidence | Step-through execution and the dry-run report | Screenshot required |
| — | — | Monitoring and operations | Diagnosis of a changed application and the proposed adjustment | Screenshot required |
| — | — | Monitoring and operations | Operational dashboard, alert rules and notification settings | Screenshot required |
| — | — | Governance and audit | Audit history, workflow change history and retention configuration | Screenshot required |
