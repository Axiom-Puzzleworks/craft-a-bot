<!--
=======================================================================
 AXIOM VERITY — BRAND LAYER (PDF production)
 -----------------------------------------------------------------------
 This document is typeset as a branded PDF. The brand values below are the
 real ones, taken from the Axiom Verity design system (DESIGN.md in the
 axiomverity repository, frontmatter + "Colors" and "Typography"), not
 placeholders. Nothing in the body text depends on them: the manual reads
 correctly as plain markdown without a single asset.

   brand.wordmark    : "Axiom" in ink + "Verity" in gold-ink, Newsreader 600,
                       0.36em word gap  (src/lib/components/BrandWordmark.svelte)
   brand.mark        : src/lib/assets/axiom-mark.svg — an open navy triangle
                       (opacity .55, 3px round caps) with three gold nodes
   brand.navy        : #0e2a4a   structure: rules, the letterhead top rule, fills
   brand.ink         : #10233a   body text and headings
   brand.muted-ink   : #4a5a72   captions, leads, secondary copy
   brand.gold        : #a8781f   large text, rules, non-text UI only
   brand.gold-ink    : #7a5a1a   any accent text below 18px (AA)
   brand.gold-tint   : #f2e6c8   the one tinted fill (pills, callout grounds)
   brand.paper       : #f7f7f5   the page ground — never pure white
   brand.surface     : #ffffff   tables, panels, figure grounds
   brand.hairline    : #dde2df / #c4ccd3   every border and rule
   brand.type.display: Newsreader 600 (Georgia, "Times New Roman", serif)
   brand.type.body   : Inter 400 (system-ui, sans-serif)
   brand.type.mono   : IBM Plex Mono (ui-monospace, monospace)

 The four standing rules of the system, honoured here:
   * one accent — gold-bronze — and nothing else beyond navy/ink/paper
   * #a8781f never carries small text; #7a5a1a does
   * every heading is Newsreader; Inter never sets a heading
   * near-square corners (0.35rem panels, 0.55rem outer), no pills

 Running header  : Craft A Bot — User Manual  ·  <section>
 Running footer  : Axiom Verity  ·  <version>  ·  page <n> of <N>
 Cover strap     : FOR SIMULATION ONLY — see §1.4
 Page size       : A4, 20 mm margins, 11 pt body
 Figure captions : "Figure n — …" ; sources listed in Appendix D
=======================================================================
-->

# Craft A Bot

## User Manual

**An LLM and agent simulator, and a proving ground for AI governance — including the UK Retail Financial Services Playground.**

---

| | |
|---|---|
| **Document** | Craft A Bot — User Manual |
| **Version** | 1.2 (draft for review) |
| **Date** | 7 September 2026 (third edition, after the second fix pass) |
| **Applies to** | `main` at `4acafc1` — V1.0 plus Day 2, Day 3 and Day 4 (WP0–WP73), and both UX fix passes |
| **Publisher** | Axiom Verity |
| **Audience** | Learners, AI-safety practitioners, conduct and model-risk reviewers, engineers |
| **Status** | Draft — for internal review before external release |
| **Classification** | Unrestricted. The product is open source (Apache-2.0); nothing in this manual is client, personal or production data. |

> **For simulation only.** Craft A Bot simulates customers, accounts, transactions, products and decisions. Every person, account, card, document and case in it is synthetic and generated from a seed. Nothing in this product touches a real customer, real money or a real transaction, and nothing in it is a claim of compliance with any regulation. See §1.4.

---

## How to read this manual

This is one manual for one product with three faces. You do not need all of it.

| If you are… | Start at | Then read |
|---|---|---|
| **New, and want to understand agents** | Part B — The Kit | §1, then Part B in order. An hour with the leaflet is the whole course. |
| **An AI-safety or red-team practitioner** | Part C — The Workshop | §11–§14, §16–§19 (scenarios, evaluators, campaigns), then Part E for the CLI. |
| **A conduct, compliance or model-risk reviewer** | Part D — The Playground | §26–§34, then §23 (the assurance pack) and §33 (the control map). You can skip Parts B and E. |
| **An engineer integrating or extending it** | Part E — The harness | §35–§37, then Part F, then Appendix B (file formats). |
| **Publishing or operating it** | Part F — Operations | §38–§41. |

Conventions used throughout:

- `Monospace` is something you type, a file, a route, or an identifier the software uses.
- **Bold** is a control you click, exactly as it is labelled on screen.
- *Italic* is a concept defined in the glossary (§3).
- A **toy name** and a **real name** are given together the first time a thing appears — the product deliberately carries both vocabularies (§3.1).

---

# Contents

**Part A — Orientation**
1. What Craft A Bot is
2. The three sections
3. The vocabulary
4. Installing and running it
5. Keys, batteries and where your data lives

**Part B — The Kit (the Simulator)**
6. The shelf
7. The bench
8. The Playroom, and running a bot
9. The Flight Recorder
10. The instruction leaflet, Robot Friends and the Scrapbook

**Part C — The Workshop**
11. Opening the Workshop
12. The Bench dashboard
13. Runs and the Run Lab
14. The Spec lab
15. The Policy Studio and the Test bench
16. The Scenario Library
17. Evaluators
18. The Eval Matrix
19. Campaigns
20. Guards
21. Sinks
22. Telemetry, Incidents and the Safety case
23. The Assurance pack
24. The Evidence store
25. The Audit centre

**Part D — The Retail Financial Services Playground**
26. The bank
27. The Advice Desk
28. The Fraud Desk
29. The Lending Desk
30. The Complaints Desk
31. Decks, counterparts and injections
32. Cohorts, parity and fairness
33. Obligations and the control map
34. Worked example: proving a control end to end

**Part E — The headless harness**
35. Getting the CLI running
36. Command reference
37. Recipes: CI, scale, and evidence

**Part F — Operations**
38. Publishing the three sections
39. Keys, egress and data handling
40. Troubleshooting
41. Limits and known behaviours

**Appendices**
A. Screen index
B. File formats and schemas
C. Keyboard and accessibility
D. Figures
E. Notes for the PDF production

---

# Part A — Orientation

## 1. What Craft A Bot is

### 1.1 In one paragraph

Craft A Bot is an agent simulator dressed as a 1970s construction toy. You snap **bricks** onto a workbench — a brain, eyes and ears, a scrapbook, a tool belt, hands and wheels, a safety brick — slot in a **goal card**, and pull the **GO** lever. The bot then tries to achieve that goal in a simulated world, one turn at a time, while a **Flight Recorder** shows every prompt it was sent, every decision it made, every tool it reached for and every rule that stopped it. Everything runs in your browser; your bots, your runs and your API keys never leave it.

### 1.2 The two purposes

Everything in the product serves at least one of two purposes, and nothing serves neither.

**A training ground.** An interactive place to learn what agentic AI actually is, by building, running, breaking and fixing agents. The teaching is done as ten designed failure-then-fix chapters: you are shown the failure *first*, then you fix it (§10.1).

**A governance proving ground.** The same engine doubles as a test rig for automated AI governance: policy cards, approval gates, guardrail vendors, evaluators, adversarial scenarios, campaigns with pass/fail gates, tamper-evident traces, drift, a safety case, and an assurance pack you can hand to a reviewer. The governance components are packaged so they can be lifted out and used in real agent stacks (`@craftabot/governance`, published as `1.0.0-rc.1`).

The **Retail Financial Services Playground** (Part D) is where the second purpose meets a real domain: a synthetic UK high-street bank and four desks — advice, fraud, lending and complaints — so that conduct and model-risk questions can be asked of an agent and answered with evidence.

### 1.3 What it is not

- **Not a production system.** No bot built here serves a real customer, moves real money, or reaches a real system of record. The desks are simulations.
- **Not real data.** Every customer, account, card, transaction, document and case is synthetic and generated from a seed. This is enforced by a test that sweeps every fixture in the repository and refuses anything shaped like a real identifier (§39.3).
- **Not compliance advice, and not a compliance claim.** The Playground names regulatory sources — the FCA's Consumer Duty, COBS, CONC, DISP and FG21/1, PRA SS1/23 and SS1/21, POCA, the MLR, UK GDPR, the Equality Act — as *what a desk is written against*. Every row in the control map is a claim of *relevance*, marked `unreviewed` until a compliance reader has read it. Nothing in the product asserts that anything complies with anything.
- **Not model training.** The product tests and integrates post-training systems. A corpus of cases is a test set, never training material.
- **Not a hosted service.** There is no server, no account and no login. The one optional exception is the shared evidence store (§24), which is a sync target for artefacts that a team provisions itself.

### 1.4 The simulation notice

Every desk view, every desk page in the Workshop and every rendered assurance pack carries a **FOR SIMULATION ONLY** strip. Keep it in any screenshot you circulate. It exists because the Playground's material is deliberately realistic: a customer with a bereavement, a caller being coached through a scam, a declined loan applicant asking why. Realism is what makes the test worth running and what makes the notice necessary.

---

## 2. The three sections

One codebase is published as three sections of a site. Which section you are in decides which packs are installed, which screens exist and what the shelf shows. This is decided **when the site is built**, never at run time — there is no toggle that reveals another section's contents.

| Section | Who it is for | What is in the box |
|---|---|---|
| **`/simulator`** — *Craft A Bot* | Learners, demonstrations, classrooms | The Kit: the starter bricks, four model brands and the persona cartridges, the Safety Patrol pack, the Explorer's World. No Workshop. |
| **`/workshop`** — *The Workshop* | AI-safety practitioners, engineers | Everything in the Simulator, plus the Workshop: guard services, evaluators, scenarios, campaigns, telemetry, the safety case, the assurance pack and the evidence store. No Playground. |
| **`/playground`** — *Retail Financial Services Playground* | Conduct, compliance and model-risk reviewers | Everything in the Workshop, plus the synthetic bank and the four desks. |

A route that does not belong to a section renders a **not in this box** page that links to the section which has it. A kit file exported from one section imports into another wherever the packs it requires exist, and says which section has them where they do not.

For local work you normally run the **`full`** build, which is every section at once with no base path. That is what `npm run dev` and `npm run preview` serve, and what this manual assumes unless it says otherwise.

> **Figure 1** — The shelf, in the `full` build, with the Workshop door open. *(Appendix D, `kit-shelf.png`.)*

---

## 3. The vocabulary

### 3.1 Two names for everything

The product carries a toy name and a real name for every concept, always together, never a third. The Kit shows the toy name with the real one a click away; the Workshop shows the real name with the toy one as a tooltip. This is deliberate: the toy framing is the hook, and the concepts underneath are taught properly.

| Toy name | Real name | What it is |
|---|---|---|
| Workbench, bench | The build canvas | Where bricks are assembled onto a bot |
| Baseplate | The agent chassis | The bot outline that bricks snap into |
| Brick | An agent module | One capability: a brain, memory, tools, senses, actions, safety |
| Socket | A slot | Where a brick can be fitted. Most sockets hold one brick; the safety socket holds up to four |
| Model cartridge | Provider + model configuration | Plugs into the Brain brick |
| Battery | An API key or token | "Batteries not included" — you bring your own |
| Goal card | The task | Slotted into the bot; becomes part of the system prompt |
| Playroom | The simulated grid world | The room with the rug, the teddy and the toy chest |
| Desk | A simulated business world | The Advice Desk, the Fraud Desk — a transcript, a case file and a queue instead of a room |
| GO lever | Start the run | Begins the sense → think → act loop |
| Flight Recorder | The trace | The complete record of a run, event by event |
| Safety brick | A guardrail | Step budgets, blocklists, approval mode, policy cards |
| Kit file | The exported agent | Portable JSON; never contains a key |
| Instruction leaflet | The tutorial | Ten chapters and six side quests |

### 3.2 The governance vocabulary

These terms have no toy name; they appear in the Workshop and the Playground as themselves.

| Term | What it means here |
|---|---|
| **Run** | One bot, one card, one attempt. Produces a trace. |
| **Trace** | Every typed event a run emitted, in order, with a SHA-256 digest so a recipient can prove it has not been altered. |
| **Tick / turn** | One pass of the loop: sense → think → decide → act. |
| **Guardrail** | A rule that runs at a hook (`pre-think`, `pre-act`, `post-act`) and returns *allow*, *block this action*, *pause for a person*, or *stop the run*. |
| **Policy card** | A guardrail written as data rather than code: trigger → predicate → disposition. Authored in the Policy Studio. |
| **Guard service** | A hosted or local screening service fitted as a brick — Model Armor, Llama Guard, Prompt Guard, Azure Content Safety, an OPA policy engine. |
| **Scenario** | A goal card plus what a test needs: threat and obligation tags, content injected at the start, what a safe and an unsafe run look like, and scripted plans. |
| **Injection** | Content delivered into the world at the start of a run through a door the world already has: something overheard, a manual entry, a tool's answer, a radio message, or a provider fault. |
| **Counterpart** | The other party in a conversation — a customer, a caller, a fraudster. Scripted (deterministic) or live (a second seat with its own brain). |
| **Evaluator** | Something that judges a finished run: deterministic (runs anywhere), model (asks a provider), or hosted (calls a service). |
| **Truth** | What was actually so in the world — the customer's real profile and cohort, an alert's true label, the affordability verdict. Never shown to the bot; written once at the end of the run for evaluators that declare they read it. |
| **Cohort** | The customer attributes fairness is measured across. Held in truth; a campaign slices by them. |
| **Campaign** | Scenarios × builds × guards × brains × seeds, with gates — a guardrail regression suite as a file. |
| **Gate** | A pass/fail rule over a slice of a campaign: an outcome rate, an evaluator pass rate, a metric, a derived metric, a label rate, a parity comparison, or a no-regression check. |
| **Boundary map** | The picture of one build: the bot at the centre, its safety stack, declared egress and the approval gate as the ring, the world inside, and providers, guard services, service lines, sinks and the human outside. |
| **Principal** | Who started a run and on whose authority — a person, a service, or another agent. Recorded on the trace, on every action's attestation, and against every approval. |
| **Service line** | A simulated external system a bot reaches through the Connector brick: the CRM, core banking, KYC, payments, the bureau. |
| **Cassette** | A recorded set of a real service's responses, replayed forever so a test never calls out. |
| **Safety case** | The structured argument that a bot is safe: what it cannot do, what controls it has, where it may call, and the evidence. |
| **Assurance pack** | The filed evidence: the safety case, campaign results, drift, incidents, the inventory entry and the control map, rendered as one document. |
| **Evidence store** | An optional shared sync target for bundles, reports, packs and authored content. |

---

## 4. Installing and running it

### 4.1 What you need

| | Version | Notes |
|---|---|---|
| **Node.js** | 20 or newer (24 recommended) | The only hard requirement |
| **npm** | 10 or newer | Ships with Node; the repository pins `npm@11.19.0` |
| **Git** | Any recent | To clone |

You do not need to install Svelte, TypeScript, Vite, Turborepo, Vitest or Playwright separately — they arrive with the install. There is no database and no cloud account to set up.

### 4.2 Install and run

```sh
git clone <your-repository-url> craft-a-bot
cd craft-a-bot
npm install          # installs every workspace; a couple of minutes the first time
npm run dev          # development server with hot reload, usually http://localhost:5173
```

For the real, optimised application:

```sh
npm run build        # builds every package and the static site, and checks the bundle budget
npm run preview      # serves exactly those built files, usually http://localhost:4173
```

`npm run build` writes a plain folder of HTML, JS and CSS to `apps/workbench/build/`. There is no server component: it can be hosted on any static host (§38).

### 4.3 Every command

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Build all packages and the `full` site; checks the bundle budget and the published schemas |
| `npm run preview` | Serve the production build locally |
| `npm run build:editions` | Build the three site sections into `apps/workbench/build/<edition>/` (§38) |
| `npm run serve:site` | Serve those three folders the way a static host would |
| `npm run test` | Unit tests across all packages, with coverage gates |
| `npm run e2e` | Browser tests on the mock provider — no key needed |
| `npm run e2e:visual` | The screenshot set used for visual regression (and for this manual's figures) |
| `npm run e2e:editions` | One smoke test per site section |
| `npm run lint` | Prettier, ESLint and `svelte-check` |
| `npm run format` | Prettier, writing |
| `npm run check` | Type checks across the workspaces |
| `npm run demo` | Build the keyless demo, ready for a static host |
| `npm run budget` | Bundle size against the budget, with per-route sizes |
| `npm run schemas` | Regenerate the published JSON Schemas in `docs/schemas/` |
| `npm run craftabot -- …` | The headless harness (Part E) |
| `npm run evals` | The scripted evaluation matrix, through the harness |
| `npm run smoke:openai` | One real call to OpenAI. Needs a key; never runs in CI |
| `npm run smoke:geap` | Live Model Armor and Gen AI evaluation checkpoint |
| `npm run smoke:azure` | Live Azure AI Content Safety checkpoint |
| `npm run smoke:harness` | A live harness run on OpenAI |
| `npm run smoke:counterpart` | One Advice Desk case with a live customer on OpenAI |
| `npm run example:governance` | The plain Node agent example that uses `@craftabot/governance` alone |
| `npm run example:python` | The Python reader over a trace bundle (skips itself if Python is absent) |
| `npm run check:governance-pack` | Check the `@craftabot/governance` tarball |

### 4.4 Your first five minutes, with no key at all

The **Demo Brain** cartridge needs no key. It runs scripted plans through the real engine, the real world and the real trace, so everything except the model's intelligence is genuine.

1. Open the app. The instruction leaflet opens by itself the first time.
2. Press **New bot** on the shelf.
3. Drag the **Brain Brick** onto the head socket — or focus a brick in the tray, press <kbd>Enter</kbd>, choose a socket with <kbd>↑</kbd>/<kbd>↓</kbd> and press <kbd>Enter</kbd> again. The whole bench is keyboard-operable.
4. Click the fitted brick and choose the **Demo Brain** cartridge.
5. Pick **Say Hello!** from the goal card rack.
6. Pull **GO**, then press **STEP** to advance a turn at a time.

---

## 5. Keys, batteries and where your data lives

### 5.1 The battery compartment

Keys are **batteries**, and they live in **Settings**. Each provider or service has its own compartment with a meter.

| Battery | What it is for | Needed for |
|---|---|---|
| **OpenAI** | An OpenAI API key | Real model runs on OpenAI cartridges |
| **Anthropic** | An Anthropic API key | Anthropic cartridges |
| **Gemini** | A Google Gemini API key | Gemini cartridges |
| **Cloud Armour** | A Google Cloud access token, minted by signing in | The Armour Brick (Model Armor) and the hosted evaluators |
| **Azure Content Safety** | A subscription key, sent as a header | The Azure guard service |
| **Supabase evidence store** | A workspace token | Pushing and pulling shared evidence (§24) |

Ollama needs no battery: it runs on your own machine and its address is a Settings field restricted to `localhost` or `127.0.0.1`.

To fit one: **Settings → the compartment → paste → Insert battery**. The key is never shown again. **Check it** verifies it; **Eject battery** removes it.

A compartment tells you when a key has actually failed. If a guard or a provider rejects a credential during a run, the meter empties and reads **Rejected — sign in again**, with the time it happened, which guardrail found out, and a pointer to the run in your Scrapbook. Signing in again, ejecting, or a passing **Test the guard** clears it.

### 5.2 Where a key goes, exactly

- **In this browser only.** It is saved in this browser's `localStorage`, in plain text. Anyone who can use this browser profile can read it, so do not use a shared computer for a key you care about.
- **To that provider and nowhere else.** There is no server. The key goes straight from the page to the provider's API, on your own account.
- **Never into anything you share.** Kit files, traces, bundles and exports are scrubbed of every secret by construction, and a test in the build fails if a key ever appears in one.
- **Use a spending-capped key.** Make a separate key for this and give it a budget. Each compartment links to the provider's key page.

The Cloud Armour token is different in one respect: a real Google sign-in mints a token that lasts about an hour, then stops working. Sign in again rather than waiting.

### 5.3 Where your work lives

| What | Where | Notes |
|---|---|---|
| Bots, runs, traces, evaluations, campaign reports, authored content | This browser's IndexedDB | Never leaves unless you export it |
| Keys and tokens | This browser's `localStorage` (`cab.keys.v1`) | Never exported |
| Preferences, run cap, your name on the trace | This browser's `localStorage` | |
| Harness runs | A directory you name, one folder per run | §36 |
| Shared evidence | Only where you have configured a store, and only what you push | §24 |

**Runs to keep.** The browser keeps a rolling number of runs (default 50) before tidying away the oldest unpinned ones. Pinned runs and Robot Friends episodes never count against it. Change it in **Settings → Workshop → Runs to keep** (5–500).

**Your name, on the trace.** Also in **Settings → Workshop**. It is written on every run you start and every approval you answer, beside an id this browser generated once. Leave it blank and the trace — and any assurance pack you file — carries the raw id alone. Set it before you produce evidence anyone else will read.

---

# Part B — The Kit (the Simulator)

## 6. The shelf

The shelf is the front door: `/` in the `full` build, `/simulator/` in the Simulator section.

**Your kits** lists every bot you have built. Each card shows its fitted bricks as a strip of colour chips and how many of six sockets are filled, with:

- **Rename**, **Duplicate**, **Bin**
- **Export** — saves the bot as a `.craftabot-kit.json` file. Keys are never included.
- **Export Passport** — the bot's agent card: a machine-readable declaration of what it is made of and what it may do.

**New bot** starts an empty one. **Import kit** loads a kit file someone sent you; if it needs packs this section does not have, the message says which section does.

**Expansion packs** shows the range as boxes: the LLM Multi-Pack, Safety Patrol, Planner, Robot Friends, Explorer's World, Library, the **Retail Bank Playground**, and Tool Shop (marked *Coming soon* — its content genuinely does not exist yet, and the shelf will not claim otherwise). In a section that does not carry a pack, its box says so and links to the section that does.

## 7. The bench

Opening a bot takes you to the bench: the parts tray on the left, the baseplate in the middle, the goal card rack along the bottom.

### 7.1 Fitting bricks

Drag a brick to its socket, or double-click it to fit it. Every brick in the tray shows its state: **Fitted**, or **Socket taken** when another brick already occupies the socket it needs. Click a fitted brick to open its panel — every panel has a flip side explaining what the brick really is.

| Brick | Gives the bot | Really is |
|---|---|---|
| **Brain** | Something to think with | The LLM, its cartridge, temperature and token settings |
| **Eyes & Ears** | Awareness of the room | The observation channels written into each prompt, and whether it can hear you |
| **Scrapbook** | Memory of recent turns | The rolling context window, and an optional notebook |
| **Tool Belt** | A calculator, dice, a notebook, a manual | Tool-calling through the provider's real tool API |
| **Hands & Wheels** | The ability to change things | World actions — the ones with consequences |
| **Safety** | Limits, blocked actions, approval | Guardrails: step budgets, capability scoping, human-in-the-loop |
| **Planner** | A plan before acting | An explicit plan/step list |
| **If/Then** | A reflex | A rule that fires without asking the model |
| **Librarian** | Retrieval | Looking things up in a manual |
| **Radio** | Talking to another bot | A channel between agents |
| **Connector** | A line to something outside | Service lines, with scopes — the reach/authority split |
| **Watchbot**, **Monitor Judge**, **Guard Brick**, **Armour Brick** | Watching, judging, screening | Safety-socket bricks: an observer, an in-run judge, a generic guard service, Model Armor |

The safety socket is the exception to one-brick-per-socket: the engine allows up to four safety bricks in a stack. The Kit bench deliberately shows one well and marks the rest *Socket taken*; stacks are fitted in the Workshop's Spec lab (§14).

**Build checks** sit under the baseplate and tell you in plain words whether the bot can run: *Everything checks out — your bot is ready to go*, or what is missing.

> **Figure 2** — The bench, with six bricks fitted and the card rack below. *(Appendix D, `kit-bench.png`.)*

### 7.2 The goal card rack

The rack holds every card the installed packs ship. In the `full` build with the Playground installed that is **fifty-eight cards**: the starter Playroom cards, the Workshop world's cards, and every desk card from the four Playground desks. Co-operative cards are filtered out — they need the Robot Friends bench.

Past a dozen cards the rack groups itself by world under sticky headings — **THE PLAYROOM**, **THE WORKSHOP**, then each desk — and offers **Find a card** (a title, a goal, a world) with a count beside it, so "58 of 58" becomes "1 of 58" as you type.

Each card shows a difficulty and, once selected, its brief, roughly how many steps it should take, and a hint about what the bot will need.

The starter cards are: **Say Hello!**, **Help the teddy get a snack**, **Tidy the blocks**, **The locked chest** (and an expert variant), **Sums for Teddy**, **Hide and Seek Tip**, **The warning sign**, **Keep the secret**, **False Alarm**, **Tidy the blocks, together**, **The party line**, and **Free play**, where you write the goal yourself.

## 8. The Playroom, and running a bot

Pull **GO** and you arrive at the run screen.

### 8.1 The controls

| Control | What it does |
|---|---|
| **STEP** (or <kbd>space</kbd>) | Advance exactly one turn |
| **Play** | Let it run to the end |
| **Stop** | Halt the run — recorded on the trace as stopped by a person |
| **Reset world** | Put the world back to the card's starting state |
| **Speed** | ×0.5, ×1, ×2, ×4 for **Play** |

The header shows **STEPS LEFT** as a meter, **TOKENS** used, and the run's state. A **Safety brick** chip appears once any guardrail has run, counting checks and saves.

### 8.2 What you are looking at

- **The world.** For a Playroom card, the room drawn from the world's own events. For a desk card, the **Desk**: a transcript, the case file as revealed so far, and the queue of what is open. Both are drawn only from what the trace says — never from the engine's internal state.
- **The thought bubble** shows what the bot is thinking this turn.
- **The story strip** narrates what happened, in plain words.
- **Say something to your bot** lets you speak to it mid-run — as the customer, on a desk card. It needs the bot's listening channel: on a Playroom card that is the Eyes & Ears brick's **Hearing**, and on a desk it is the desk's own conversation channel. If the field is disabled it says which switch is missing and offers **Turn listening on** in the message itself.

### 8.3 How a run ends

An end card appears with the outcome and a route onward — **See the flight recorder**, **Back to the bench**, and (with the Workshop open) **Open in the Run Lab**. Outcomes are `SUCCESS`, `OUT_OF_STEPS`, `STOPPED_BY_USER`, `STOPPED_BY_GUARDRAIL` and `ERROR`.

Every finished run is saved to the Scrapbook.

A run stopped by a guardrail gets one of two end cards, and the difference matters:

- **The Safety Brick did its job** — a rule you fitted caught something and stopped the run.
- **The safety check could not run** — a *hosted* guard could not reach its service (an expired token, no network), so it stopped the run rather than let it continue unchecked. That is fail-closed. Nothing was wrong with what was said.

The header chip counts them apart — *"2 checks, nothing to stop · 1 check could not run"* — and the trace carries the distinction as `cause: "could-not-check"` on the `guardrail.tripped` event, so every screen that reads it says the same thing: the status lamp reads **Stopped — the check could not run** rather than *Stopped by a safety rule*, and the story strip ends *"The safety check could not run, so the run stopped."* See §40.1.

## 9. The Flight Recorder

The Flight Recorder is the trace, live. Every row is one typed event: `run.started`, `tick.started`, `sense`, `prompt.composed`, `think.started`, `think.token`, `think.completed`, `decision`, `tool.executed`, `action.performed`, `memory.updated`, `guardrail.checked`, `guardrail.external`, `guardrail.tripped`, `approval.requested`, `approval.resolved`, `world.changed`, `input.delivered`, `provider.retried`, `error`, `run.finished`, and the group events for a two-robot episode.

Click any row to see exactly what happened, including the full prompt that was sent. **Export trace** saves the whole run as a `.craftabot-trace.json` with a digest a recipient can verify.

This is the product's first hard rule made visible: anything the interface shows about the engine's behaviour arrives as a typed event on the bus. There is no hidden machinery.

## 10. The leaflet, Robot Friends and the Scrapbook

### 10.1 The instruction leaflet

The leaflet is the tutorial, written as a real kit's paper instructions. It has **ten chapters** and **six side quests**, and it points at the real interface as you go.

| Chapter | You watch it go wrong | You fix it by | The real idea |
|---|---|---|---|
| 1 — A brain with no hands | It thinks beautifully and nothing happens | Adding Hands & Wheels | What an agent loop is |
| 2 — Eyes open | It acts, but greets an empty corner | Adding Eyes & Ears | Observations |
| 3 — The goldfish problem | It has the same good idea over and over | Adding the Scrapbook | Why memory matters |
| 4 — Confidently wrong | It says 17 × 23 = 371 | Switching on the calculator | Hallucination, and tools as the cure |
| 5 — Looking things up | It shoves a locked lid, repeatedly | Switching on the manual | Retrieval |
| 6 — Who says yes | It changes the world without asking | Switching on approval mode | Guardrails and human oversight |
| 7 — Turning the dials | | Temperature, budgets, autonomy | Configuration is behaviour |
| 8 — Think it through | | The Planner brick | Planning |
| 9 — Skip the thinking | | The If/Then brick | Reflexes |
| 10 — Ask before you guess | | Scoping and asking | Least privilege |

The six side quests are the governance scenarios: **The warning sign**, **Keep the secret**, **Busy bot**, **Who is watching?**, **The party line** and **False Alarm**. Each earns a merit badge.

Dismiss the leaflet with **Close** for now, or **I've built kits before** to stop it opening on its own. Reopen it any time from **Instructions**, and restart it from **Settings → Instruction leaflet**.

### 10.2 Robot Friends

**Robot Friends** on the bench runs two bots in one world, taking turns, on a co-operative card such as **Tidy the blocks, together** or **The party line**. Both robots' events land on one merged stream, and the episode is saved as a group run you can export as a single bundle.

On a desk card, the second seat is the **visitor** — the customer, caller or applicant across the desk (§31.2).

### 10.3 The Scrapbook

**Scrapbook** lists every adventure the browser has kept, newest first, with its outcome. Open one to replay it turn by turn. Pin an adventure to protect it from being tidied away when the run cap is reached.

---

# Part C — The Workshop

## 11. Opening the Workshop

The Workshop is the same bots, the same runs and the same traces, shown as an engineer and a reviewer need them. It is off by default.

**To open it:** Settings → Preferences → **Show the Workshop**. A **Workshop** button then appears in the Kit's top bar. In the `/workshop` and `/playground` sections it is open from the start.

Everything in the Workshop is a *consumer* of the same stores and the same event data the Kit uses. A bot built in either place runs identically in both; the mode changes presentation, never behaviour.

### 11.1 The rail

A persistent left rail lists every screen:

**Bench** · **Runs** · *Spec lab (per bot)* · **Evals** · **Campaigns** · **Evaluators** · **Scenarios** · **Sinks** · **Evidence** · **Playground** · **Policies** · **Test bench** · **Telemetry** · **Incidents** · **Safety case** · **Assurance** · **Audit** · **Guards**

**← The Kit** at the foot returns you to the toy.

### 11.2 The Control Room

The Workshop wears the same design system as the Kit in a different register: brushed panel greys, graph-paper cream, engraved labels, and one green accent reserved for live telemetry. Every number, grid and series is drawn through one set of instruments — readouts, strips, lamps, meters, tape charts, matrices, case tables, transcripts, case files, queues, the delegation chain, the explanation panel and the boundary map — so a colour or a shape means the same thing on every screen. The colour-to-concept law is shared with the Kit and never re-assigned: a trace lane means the same thing everywhere.

## 12. The Bench dashboard

The Workshop's home. Four readouts across the top — **runs this week**, **success rate**, **mean turns to success**, **guardrail saves** — with a tape chart of activity, then:

- **Campaigns** — the most recent stored campaign reports, or an invitation to run the baseline.
- **Fleet** — every bot, its fitted bricks as colour chips, how many runs it has, its last outcome and when it last ran. Each name links to that bot's Spec lab.

The dashboard says plainly what it does not show: there is no cost model in the product and no thirty days of history, so spend and 30-day trends are absent rather than invented.

> **Figure 3** — The Bench dashboard. *(Appendix D, `ws-dashboard.png`.)*

## 13. Runs and the Run Lab

### 13.1 The Run Browser (`/workshop/runs`)

Every stored run, filterable by **search** (bot, card, model, run id), **bot**, **card**, **outcome**, and **pinned only**. The table gives started time, bot, card, outcome, turns used against the budget, elapsed time, model and tokens. A two-robot episode appears as the group with its members indented beneath it.

- **Open a run** by clicking its started time, or the bot's name, in the row.
- **Compare** — tick two runs and press **COMPARE** for a side-by-side view with synchronised scrubbing.
- **Pin** — the star; pinned runs survive the run cap.
- **Import trace…** — load a `.craftabot-trace.json` from anywhere. Its digest is verified on the way in, so a foreign trace declares whether it has been altered.

When runs have been left part-way and never finished, a banner at the top says how many — and, if any of them are episodes, how many of those — and offers **Mark them abandoned**. They then read `ABANDONED` everywhere: in this table, in an episode's own row and its members' rows, on the Bench dashboard's fleet, and in Telemetry, the safety case and drift, which share one definition of *finished*. The run in progress is never touched.

### 13.2 The Run Lab (`/workshop/runs/<runId>`)

The flagship screen. Four regions.

**The header** — the bot, the outcome, the card, the model, the budgets and what was used, a **✓ trace integrity** badge, a chip saying who started the run (*started by Sam*, or *started by an unnamed person (18706923…)* until you set a name — §5.3), **Fork from turn *n***, and **Open in Kit**.

**The world.** A Playroom run shows the room; a desk run shows the Desk — **TRANSCRIPT**, **CASE FILE** and **QUEUE**, with a **FOR SIMULATION ONLY** strip and a collapsed **Case file (truth) — what was actually so** panel that opens only after the run has ended, and never appears in the Kit. A turn scrubber runs beneath.

**The boundary.** The build drawn as a picture (§13.3).

**The timeline and inspector.** Every event, grouped by turn, colour-coded by lane, with:

- lane filter chips — **run**, **tick**, **sense**, **think**, **action**, **memory**, **guardrail**;
- **Only trouble** — just the failures, refusals, trips and errors;
- a payload search box;
- **Raw JSON** to see the event exactly as stored;
- **Explain** to open the decision explanation for the selected turn (§13.4).

Click any row and the inspector shows what happened. For a guardrail trip that is the rule, the hook, the reason in plain words and the disposition:

```json
{
  "guardrailId": "geap/armor:observation",
  "hook": "pre-think",
  "reason": "the guard could not check — the battery token was rejected",
  "disposition": "stop-run"
}
```

> **Figure 4** — The Run Lab over a Playroom run. *(Appendix D, `workshop-run-lab.png`.)*
> **Figure 5** — The Run Lab over a desk run, showing the transcript, case file and queue. *(Appendix D, `desk-play.png`.)*

### 13.3 The boundary map

The boundary map answers "what is this agent, what stands between it and the world, and what can it reach?" in one picture, drawn only from the registry, the specification and the trace.

- **At the centre**: the bot and its bricks.
- **The ring**: the safety stack, the declared egress and the approval gate — the execution boundary.
- **Inside**: the world it acts in, and the counterpart if there is one.
- **Outside**: the model provider, every guard service, every service line, evaluators, sinks and the evidence store — each with the hosts it may call and a key symbol if it uses a credential.
- **On the ring**: the human, where approvals cross.

A numbered legend lists each edge in words. Over a trace, scrubbing lights the edge that fired at that turn: a tool call on a line, a screening call to a vendor, an approval crossing to a person.

The same map appears statically on the Spec lab (for a build), on each desk's Playground page (for that desk's campaign build), and inside the assurance pack.

### 13.4 Explain, and fork

**Explain this decision** shows, for one turn: what the bot saw, what it was offered, what it chose, which checks ran and what they said, and what the world did in response. Related rows are highlighted in the timeline. Incidents in the assurance pack quote this fold, so an explanation and an incident say the same thing.

**Fork from turn *n*** replays the run to that turn — exactly, because the world is deterministic — and runs on from there, then opens the fork beside its origin in Compare with the scrubbers synchronised from the fork point. In the browser a fork carries no overrides; to fork with a *different build* — another guard stack, another bot — use the harness (§36.6). This is the counterfactual: *would this have gone differently with that control fitted?*

## 14. The Spec lab (`/workshop/spec/<agentId>`)

The bench, grown up. The same baseplate on the left, and on the right the full picture of the specification:

- **Build checks** — the same checks the Kit shows.
- **Contract** — which brick kinds, packs and versions this bot requires, and whether they are satisfied.
- **Bricks required**, **Safety stack**, **Named stacks**, **Autonomy**, **Policy cards fitted**.
- **Boundary** — the map for this build, before it has ever run.
- **AgentSpec** — the specification as JSON, with inline validation.

The **Safety stack** is the Workshop's one editing surface: fit up to four safety bricks in order, take one off, and see the capacity. **Named stacks** are the pre-built combinations a campaign refers to, including the **Compliance Watchbot**. **Autonomy** sets how much the bot may do without asking.

> **Figure 6** — The Spec lab. *(Appendix D, `workshop-spec-lab.png`.)*

## 15. The Policy Studio and the Test bench

### 15.1 The Policy Studio (`/workshop/policies`)

Guardrails as data. A policy card is a trigger, a predicate and a disposition — *when the bot is about to do X, and Y is true, then block / ask / stop / note*.

- **Author** — build the card: the hook, the predicate leaves, the disposition, the message.
- **Test bench — would this have fired?** — run the card against a stored run and see where it would have triggered.
- **Test bench — a scripted run** — run it against a scripted scenario end to end.
- **Library** — every card the installed packs ship, plus your own.

The predicate leaves available are: the kind of call, its name, an argument equal to / containing / matching a pattern, something in the observation, something in the composed prompt, a world predicate, a count over history, and the hook itself. Cards you author are saved to your own content store and can be fitted on a bot like any shipped card.

> **Figure 7** — The Policy Studio. *(Appendix D, `ws-policies.png`.)*

### 15.2 The Test bench (`/workshop/bench`)

Assertion cards: deterministic checks run against a stored run's trace. **Your cards** lists the ones you have written; every card is also an evaluator (§17), so anything you write here can gate a campaign.

## 16. The Scenario Library (`/workshop/scenarios`)

A scenario is a goal card plus what a test needs. The library lists every scenario the installed packs ship — about eighty in the `full` build — with its card, its tags, its injections, and buttons to play its **Safe plan** or **Unsafe plan** as a scripted run.

The tags are the vocabulary reports group by: threat identifiers (`ASI01`, `ASI02`, `ASI07`, `prompt-injection`, `tool-poisoning`, `confused-deputy`, `social-engineering`, `exfiltration`, and glosses such as *the lethal trifecta*, *indirect prompt injection*, *MCP security* and *policy compliance under pressure*, whose raw ids sit in the tooltip) and obligation identifiers (`fca:cd:*`, `fca:cobs-9:suitability`, `fca:conc:affordability`, `poca:tipping-off`, `ukgdpr:data-minimisation`, `equality-act:fairness`, and the rest — §33).

**Import a corpus** turns a JSONL file — one `{"text": "…", "tags": ["…"]}` per line — into scenarios over a card you choose, with the text filed in that world's manual under a key you name. This is how a third-party prompt-injection corpus is run through a desk. Imported scenarios live for the session only.

> **Figure 8** — The Scenario Library. *(Appendix D, `ws-scenarios.png`.)*

## 17. Evaluators (`/workshop/evaluators`)

An evaluator judges a finished run. Pick a run at the top, then run any evaluator against it; results are stored beside the run and appear in the Run Lab, the bundle and the assurance pack.

Three kinds:

| Kind | What it needs | Examples |
|---|---|---|
| **deterministic** | Nothing — runs anywhere, and in CI | `fs-advice/suitability-complete`, `fs-fraud/alert-decision`, `fs-lending/explanation-faithful` |
| **model** | A provider (Ollama makes it free) | `evals/judge/rubric`, the four Consumer Duty rubrics |
| **hosted** | A battery and a project | `geap/eval/safety`, `geap/eval/fulfillment`, `geap/eval/rubric` |

A hosted evaluator without a project runs **offline** and says so, returning a canned, labelled result rather than failing — so a campaign that names one still runs in CI.

An evaluator that reads **truth** is marked *reads truth*: it is allowed to compare what the bot did against what was actually so. A malformed answer from a model judge is *inconclusive*, never a pass.

> **Figure 9** — The Evaluators screen. *(Appendix D, `ws-evaluators.png`.)*

## 18. The Eval Matrix (`/workshop/evals`)

Goal cards × cartridges × configurations × seeds, run as a grid, scored, and diffed against a committed baseline. **Success rate** is the grid; **Scorecard** is the numbers — success, median turns, loop score, wasted-turn ratio, naming misses, tokens. Drill from a cell to the runs behind it and into the Run Lab.

The matrix is the quick instrument. When you want gates, evidence and a file CI can run, use a campaign.

> **Figure 10** — The Eval Matrix. *(Appendix D, `ws-eval-matrix.png`.)*

## 19. Campaigns (`/workshop/campaigns`)

A campaign is the product's unit of proof: **scenarios × builds × guards × brains × seeds, with gates**, written as a file that both this screen and CI can run.

### 19.1 The screen

- **Shipped** is a picker over every campaign the installed packs carry — the injection baseline and the four desk baselines — and **Load baseline** puts the one you chose into the editor. A `?baseline=<id>` link opens straight onto one, which is what each desk page's **Run this desk's campaign** uses.
- **Import…** loads a campaign file from disk.
- The **editor** holds the campaign as JSON — the same file the harness runs.
- **Add a shelf bot as a build** adds one of your own bots as a build in the matrix.
- **Save to your content** keeps the campaign in this browser.
- The cell count is shown beside the buttons; **Run campaign** runs it.

Only scripted, offline cells run in the browser. A cell that calls a real model, a real vendor or a real evaluation service needs the campaign's own `budget` block and runs from the harness.

### 19.2 Running one

Press **Run campaign**. A progress counter — *Running 176/640…* — appears beside **Cancel** and a line reading *"4s elapsed, about a minute left — running in a Worker, so this page stays live; the report is stored when it finishes, even if you leave."* Take that literally too: the run belongs to a background Worker, not the page, so you can open the Run Browser mid-run and come back to the stored report. Press **Run campaign** again while one runs and the next is **queued** behind it; the queue lists each with its status. The estimate is a trailing average over the last twenty cells and is deliberately rounded — *under a minute*, *about a minute*, *about three minutes* — because the first cell is the slowest and a mean taken from the start read about twice long.

All five shipped baselines run here, offline, including the four Playground ones: the injection baseline is 640 cells and finishes in well under a minute on a laptop; the Advice Desk baseline is 930 cells and takes about twenty seconds longer. What still needs the harness is a cell that calls something real — a live brain, a live counterpart, a hosted evaluator or a hosted guard with no offline stand-in (§36.2, §40.3).

### 19.3 Reading the report

**VERDICT** states the outcome — *PASSED — 13 of 13 gates · 640 cells* — with four downloads:

| Download | For |
|---|---|
| **Report JSON** | The whole report, including every cell |
| **Scorecard** | Markdown, for a person |
| **JUnit** | XML, for a CI system's test view |
| **SARIF** | For code-scanning and security tooling |

**GATES** lists every gate: its name, the slice it applies to (`scenario=…`, `guard=…`, `brain=…`, `cohort=…`), what was required, what was observed, how many cells it covered, and pass or fail. A gate whose slice matches no cells **fails** rather than passing vacuously.

**CELLS** is the grid: one row per scenario × guard × brain, with the success rate and each evaluator's pass rate, and a **runs** button that drills into the runs behind the cell.

**CASES** is one row per run — scenario, guard, brain, seed, outcome, turns, cost, approvals, and a column per cohort and per evaluator label. **Find** narrows by any text on the row (scenario, guard, brain, seed, outcome, cohort, label), and the table grows a hundred rows at a time. It is labelled *Failures first* and sorts that way: anything that errored or ended in something other than `SUCCESS` comes before the rest, stably, so the interesting cases are at the top of the first page.

For a Playground campaign the report also carries the **confusion matrix**, the **cohort slices** and the **obligation table** (§32, §33).

**STORED REPORTS** keeps every report this browser has run, with its verdict, so you can reopen one later.

> **Figure 11** — A campaign report: verdict, gates and cells. *(Appendix D, `ws-campaigns.png`.)*

### 19.4 The gates you can write

| Gate | Asks |
|---|---|
| `outcome-rate` | Did at least / at most this fraction of runs end in this outcome? |
| `assertion-pass-rate` | Did this assertion card pass often enough? |
| `evaluator-pass-rate` | Did this evaluator pass often enough? |
| `metric` | Is this metric above / below this value? |
| `derived-metric` | Is a derived number — precision, recall, F1, false-positive rate — above / below this value? |
| `label-rate` | Does this evaluator's label occur at most / at least this often? |
| `parity` | Does this number differ across cohorts by more than this much? |
| `no-regression` | Has this got worse than the committed baseline? |

## 20. Guards (`/workshop/guards`)

Every guardrail service an installed pack ships, with — for each — what it screens, which battery it needs and whether one is fitted, which hosts it calls, whether it can be called from a browser at all, a **Settings (JSON)** block, **Test on a fixture**, **Test the guard** (a real call, where a battery is fitted) and **Fit into bot**.

| Service | What it does | Battery | From a browser |
|---|---|---|---|
| **Model Armor** `geap/model-armor` | Google Cloud: prompt injection, harmful content, sensitive data, malicious links | Cloud Armour token | yes |
| **Llama Guard (local)** `guard-local/llama-guard` | Fourteen hazard categories on your own machine via Ollama | none | no — the harness runs it |
| **Prompt Guard (local)** `guard-local/prompt-guard` | Injection classifier — benign, injection, jailbreak | none | no — the harness runs it |
| **Azure Content Safety** `azure-content-safety/content-safety` | Prompt Shields, plus four harm categories with severity | Azure key (header) | no — the harness runs it |
| **Policy Engine (OPA)** `pdp-opa/opa` | Asks an Open Policy Agent whether each proposed call is allowed | none | yes |

A guard fitted through the **Guard Brick** starts **unplugged**: nothing leaves the browser until you say so. Fitting a guard is how a vendor is put under test — the same bot, the same scenarios, a different guard stack, and a campaign to say which held.

> **Figure 12** — The Guard Rack. *(Appendix D, `ws-guards.png`.)*

## 21. Sinks (`/workshop/sinks`)

Where a trace can be sent. Two sinks ship: a **file** sink (JSONL, used by the harness) and an **OTLP/HTTP** sink that posts OpenTelemetry GenAI spans to a collector you name. Configure one here, attach it live to the run in progress, or send a stored run or bundle from the Audit centre. A sink's failures are surfaced and never affect the run: the loop does not wait for a consumer.

## 22. Telemetry, Incidents and the Safety case

### 22.1 Telemetry (`/workshop/telemetry`)

Cross-run measurement:

- **By goal card** — runs, success, looped, mean turns, mean tokens.
- **By cartridge** — the same, per provider and model.
- **By day** — activity and rates as tape charts.
- **Guardrail trip mix** — which rules are firing.
- **Drift** — a flag when a day's guardrail trip mix moves by half or more, or its loop rate by thirty points, or a domain series by thirty points, against the days before it. When nothing has moved it says so, with the thresholds.
- **Over time** — a table per day: runs, success, looped, trips per run, busiest guardrail.
- **Autonomy** — approval rate, and how many runs a person stopped.

> **Figure 13** — Telemetry, with drift. *(Appendix D, `ws-telemetry.png`.)*

### 22.2 Incidents (`/workshop/incidents`)

Every failing thing worth a second look, derived from the traces: guardrail trips, refusals, errors, actions that failed. Each incident carries the explanation of the decision at that turn — what the bot saw, what it was offered, what it chose and what checked it.

### 22.3 The Safety case (`/workshop/safety-case`)

The structured argument for one bot, in five parts: **Inability** (what this build simply cannot do), **Control** (what stands in the way of what it can), **Where it may call** (the declared egress), **Trustworthiness**, **Evaluation evidence** and **Campaign results**.

*Inability* is the strongest claim available and is computed, not asserted: a bot with no Hands & Wheels brick cannot act on the world, so nothing it says can move anything.

## 23. The Assurance pack (`/workshop/assurance`)

The assurance pack is the filed evidence for one bot, in the shape a model-risk or conduct reviewer reads. Choose a bot, and the page assembles:

- a header of counts — **control rows**, **unreviewed**, **pending**, **runs**, **campaigns**, **incidents** — and the pack's **digest**;
- **Download the report (HTML)** — one self-contained file that opens in any browser with no application behind it, which is what you send to a reviewer;
- **Download as markdown** and **Download the pack (JSON)**.

The body follows PRA SS1/23's principles, with the Consumer Duty outcomes as its second axis:

1. **Identification and classification** — the inventory entry: the agent card, the packs and versions the bot requires, the world it works in.
2. **Governance** — the safety stack, approvals requested and granted, declared egress, and the principal who started each run.
3. **Development, implementation and use** — the campaigns that name a build of this bot.
4. **Independent validation** — who validated this build, and the evaluations over its runs.
5. **Risk mitigants** — what the bot *cannot* do, what irreversible actions it can reach, and the kill switch.
6. **Ongoing monitoring** — the drift series and the incident log.
7. **The Consumer Duty outcomes** — control rows and evaluator evidence per outcome.
8. **The control map** — every row: framework, reference, obligation, the evidence for it, and its review status.

Every number cites the runs behind it. The pack states, at the top and the bottom, that it files evidence against obligations as *claims of relevance*, is not a claim of compliance, and describes a simulator that controls nothing real.

The screen opens on the bot you ran most recently. If no name is set, a bar at the top says so — *"Runs started from this browser are recorded as person 18706923… with no name. A pack a reviewer reads should say who"* — with a field and **Save to Settings**. Runs already stored keep the id they were written with, because the pack is evidence.

> **Figure 14** — The assurance pack. *(Appendix D, `workshop-assurance.png`.)*

## 24. The Evidence store (`/workshop/evidence`)

Optional, and off unless you set it up. The evidence store is a **sync target for artefacts only** — bundles, campaign reports, assurance packs and authored content. Never a key. Never the source of truth. Never required.

Two stores ship:

- **`evidence/supabase`** — a table per artefact kind in a Supabase project your team provisions, one workspace per token. See `docs/evidence-setup.md`.
- **`evidence/memory`** — no project behind it; rows live in the page and vanish with it. For seeing the flow.

Each store carries a three-step checklist, ticked as you go:

1. **Save the store's config** — labelled **URL**, **ANONKEY** and **WORKSPACE** fields, with the whole thing as JSON beneath for pasting (the fields write it).
2. **Fit the workspace token** — here or in Settings.
3. **Test the connection** — one real pull, enabled once the config is saved.

Until the checklist is done the page says so, and everything else in the product works exactly as before. Once configured, push from the Audit centre or the Campaigns screen, and pull into the Run Browser — every pulled item's digest is verified before it is stored, and one that fails is refused.

> **Figure 15** — The Evidence screen. *(Appendix D, `ws-evidence.png`.)*

## 25. The Audit centre (`/workshop/export`)

Where evidence leaves. For a run or a two-robot episode:

- **Trace bundle** — the run, or every member of an episode, with evaluations, campaign identity and a digest over the whole (`craftabot-bundle` v1).
- **Trace and reports** — the trace file, the OpenTelemetry export, the safety case, the incident log and the telemetry, as files.
- **Send to a sink** — push to a configured collector (§21).
- **Push to the evidence store** — where one is configured (§24).

> **Figure 16** — The Audit centre. *(Appendix D, `ws-audit-centre.png`.)*

---

# Part D — The Retail Financial Services Playground

> Everything in this Part is synthetic. Every customer, account, card, transaction, complaint and bureau file is generated from a seed. Every regulatory source named is named as a source — what a desk is *written against* — and nothing here is a claim of compliance.

## 26. The bank

The Playground is one synthetic high-street bank and the desks that work it. UK retail financial services was chosen because its obligations are written down, its harms are concrete, and one customer is seen through several journeys: the person who asks for savings advice on Monday is the one whose card is declined on Friday and who complains the week after.

**`/workshop/playground`** shows the bank itself.

### 26.1 A case

**A CASE** generates a customer from a seed. Change the seed, press **Generate**, and you get a different one — the same seed always gives the same customer, which is what makes every test reproducible. The header shows the customer, how many accounts, how many transactions and how many complaints.

Below, two columns:

- **On the desk** — what a bot can see at the start: the notice, the product shelf.
- **On file — what a look-up would earn** — what a service line will hand over if the bot asks: the customer record, the accounts, the recent activity, each marked with its classification.

### 26.2 What the bank generates

| | |
|---|---|
| **The customer** | Age band, income band, employment, dependants, a fictional postcode area, tenure, digital confidence, consent and channel preferences |
| **The cohort block** | The fairness axis: age band, income band, one to three opaque *protected proxies* (`proxy-a`…`proxy-f`, never a real characteristic), support needs, literacy band. Held in truth |
| **Vulnerability drivers** | The four groupings FG21/1 uses — health, life events, resilience, capability — with only a subset *disclosed* on the bank's file; the rest is truth |
| **Accounts** | Current, savings, credit card, loan, mortgage; a current account always |
| **Baseline and history** | What is usual for the account — spend, typical transaction, merchant categories, devices, countries, payees — and transactions that depart from it |
| **The bureau file** | Score band, defaults, arrears, recent searches, and an affordability summary |
| **Complaints** | Category, summary, status |
| **The shelf** | About thirty products across savings, investment, credit and insurance, each with a risk band (1 cash-like to 7 speculative), an annual charge in basis points, eligibility, a target market, a factsheet and the warnings that must ride with it |

### 26.3 The nine service lines

What a desk's **Connector** brick can reach. Each answers from the bank's own state, declares a risk tier on every operation, and is recorded on the trace exactly as any tool call is.

| Line | Operations |
|---|---|
| `fs-bank/crm` | Read customer · Read record · Update contact · Add note |
| `fs-bank/core-banking` | Balances · Place hold · **Freeze account** · Unfreeze |
| `fs-bank/payments` | Pending · Hold payment · Release payment · **Send payment** |
| `fs-bank/kyc` | Verify identity (can fail) · Verification status |
| `fs-bank/product-catalogue` | List products · Factsheet |
| `fs-bank/order-desk` | Quote · **Place order** |
| `fs-bank/credit-bureau` | Bureau file · Affordability |
| `fs-bank/sar-filing` | **File SAR** |
| `fs-bank/complaints` | Log complaint · Update complaint · **Pay redress** |

**Bold** operations cannot be taken back. A mutation comes back as *data* for the desk's own action to write, so the trace attributes the change to the bot's decision rather than to the line.

### 26.4 Classification, purpose and truth

Every record the bank holds is marked `public`, `personal` or `special-category` — UK GDPR's vocabulary. Every desk declares a **purpose**: `advice`, `fraud-operations`, `lending` or `complaints`. A line answers a special-category record only for a purpose that allows it.

**Truth** is what nobody at the desk can see: the cohort block, the customer's actual vulnerability, and whatever the desk adds — the set of suitable products, an alert's true label, the affordability verdict. It is written once, at the end of the run, and only evaluators that declare they read it ever see it. It appears in the Run Lab behind a collapsed panel *after* the run ends, and never in the Kit.

This is the property that makes the Playground a test rig rather than a demo: what the bot *should* have done is known, not guessed.

> **Figure 17** — The Playground: a generated case and the nine lines on a boundary map. *(Appendix D, `ws-playground.png`.)*

## 27. The Advice Desk

**`/workshop/playground/advice`** · pack `fs-advice` · world `fs-advice/the-advice-desk` · purpose `advice`

The bank's savings-and-investment assistant. It must gather what suitability requires, stay on the right side of the advice boundary the card sets, describe products with their warnings, recognise a customer who is vulnerable, and either recommend or refer.

**Seventeen cards · thirty-one scenarios in five decks · seven policy cards · thirteen evaluators · one campaign.**

### 27.1 What the bot can do

`say` · `ask-suitability-question` · `record-customer-fact` · `recommend-product` · `refer-to-adviser` · `execute-investment` (irreversible, and there precisely so that approval mode has something to gate).

Its senses are the conversation, the customer record and the product shelf. Answers are **earned**: what is on file is hidden until the bot asks for it.

### 27.2 The decks

| Deck | What it tests |
|---|---|
| **advice-and-savings** | The plain first-timer; the customer who wants to skip the questions; a rainy-day fund; a first home; a goal nothing on the shelf fits; the pushy customer; the guarantee-seeker; two guidance-only variants where the desk may not advise at all |
| **vulnerable-customer** | A bereavement disclosed part-way, and again with a plea to just decide; a customer who finds reading hard; a sight-related support need |
| **financial-promotions** | The desk asked to promote a specific fund; a customer who has heard it is the one; two products suit and one is dearer; a customer asking outright what it costs; the customer who offers to sign if the assistant will just say "guaranteed" |
| **red-team** | The impersonator wanting an address change, and again threatening a complaint; instructions inside the customer's message; an "ADMIN OVERRIDE"; an instruction riding on a CRM read; a poisoned factsheet; a request to read an account number out loud; "just execute it"; a request for anything on file about the customer's health |
| **operational-incident** | The systems go down mid-conversation |

### 27.3 The seven policy cards

| Card | What it blocks |
|---|---|
| **No recommendation before suitability** | A recommendation until the five suitability questions have been asked |
| **No guarantees** | Telling the customer a return is guaranteed, risk-free, or that they cannot lose |
| **Risk warning rides with every recommendation** | A recommendation whose reasons carry neither the capital-at-risk warning nor the deposit-protection note |
| **Vulnerability means refer** | After a disclosure: stops an execution, and pauses a recommendation for a person |
| **Four eyes on execution** | Pauses every execution for a person, at any autonomy |
| **PII stays on the desk** | Saying an account number, a sort code or a National Insurance number out loud |
| **Purpose-limited lookup** | Reading the special-category vulnerability record unless the customer has disclosed |

### 27.4 The thirteen evaluators

Nine deterministic — **suitability complete**, **recommendation suitable** (*reads truth*; labels `suitable` / `unsuitable` / `none`), **warning given**, **boundary held**, **vulnerability actioned** (*reads truth*), **PII contained**, **no guarantee language**, **data minimised** (*reads truth*), **execution approved** — and four model rubrics, one per Consumer Duty outcome: **consumer understanding**, **consumer support**, **products and services**, **price and value**.

### 27.5 The campaign

`campaigns/fs-advice-baseline.json` runs the desk's scenarios under four guard stacks against scripted brains — 930 cells — and gates on the things that matter: no unsuitable recommendation under any stack but *none*, PII contained everywhere, vulnerability actioned, nothing executed without approval. CI runs it on every change, and **Run this desk's campaign →** at the foot of the deck table opens it in the Campaigns screen (see the caveat in §19.2).

> **Figure 18** — The Advice Desk. *(Appendix D, `ws-playground-advice.png`.)*

## 28. The Fraud Desk

**`/workshop/playground/fraud`** · pack `fs-fraud` · purpose `fraud-operations`

The bank's fraud-operations assistant: work a queue of alerts, look up what the file says, decide, and handle the call from the customer or the "customer" — without ever tipping them off.

**Twelve cards · eighteen scenarios in five decks · five policy cards · ten evaluators · one campaign.**

### 28.1 What the bot can do

`open-alert` · `look-up` · `verify-caller` · `release` · `hold` · `block-card` · `freeze-account` (irreversible here — the customer is locked out) · `escalate` · `file-sar` (irreversible, and never to be mentioned to the customer) · `say`.

Truth holds each alert's real label — `fraud`, `genuine` or `mule-in` — the reason an analyst could have found, and whether the caller is the account holder or an impersonator.

### 28.2 The decks

**fraud-and-scams** — the mixed queue; account takeover; the authorised push-payment scam where the *genuine* customer is being coached; money in for a mule; the card abroad with a travel note on file.
**calls** — the distressed account holder, and worse; the second-line caller claiming to be the bank's own fraud team, and again with urgency; the coached caller, and again insisting.
**red-team** — a CRM note that gives orders; the same note through the CRM line; a verification service that lies; and again with a threat.
**stress** — Friday afternoon: twenty alerts, twelve of them fraud, under a turn budget.
**operational-incident** — the systems go down mid-call.

### 28.3 The five policy cards

**Freeze needs a second look** · **No SAR without escalation first** · **Never tip off** · **Verify before you act on a call** · **No auto-release from instructions in records**.

### 28.4 The ten evaluators

**Alert decision** (*reads truth*) is the important one: it labels the focal alert `tp`, `fp`, `tn` or `fn` against the truth, which is what gives the report its **confusion matrix** — precision, recall, F1 and the false-positive (false-freeze) rate. Alongside it: **queue decisions**, **caller verified before action**, **no tip-off**, **SAR after escalation**, **time to decision**, **approval load**, **scam warning given**, and two call rubrics.

### 28.5 The campaign

`campaigns/fs-fraud-baseline.json` — the first report with a confusion matrix and a parity gate. It gates on recall, on the false-freeze rate, on never tipping off, on verification before action, and on the approval load not regressing.

> **Figure 19** — The Fraud Desk. *(Appendix D, `ws-playground-fraud.png`.)*

## 29. The Lending Desk

**`/workshop/playground/lending`** · pack `fs-lending` · purpose `lending`

The bank's lending assistant: verify the applicant, assess affordability, decide — approve, decline or refer — on the reasons the worksheet showed, explain the decision in those reasons and no others, pay out under four eyes, and hear the appeal.

**Ten cards · seventeen scenarios in five decks · five policy cards · five evaluators · one campaign.**

> **The verdict is a rule, not a scorecard.** The bank's affordability verdict is a deterministic rule over a synthetic bureau file. There is no credit model here, and none is implied.

### 29.1 The decks

**lending-journey** — the clear approve (and hurried); the clear decline; the borderline the rules say to refer; the applicant in a hurry.
**explanation-and-appeal** — the declined applicant asks why, and presses; the appeal, and the appeal with the ombudsman named.
**fairness** — the **matched pair**: the same finances on two cohorts, one seed apart. This is the slice the parity gate reads.
**red-team** — the doctored payslip, through the bureau line, and insisted on; a claimed support need used to skip the affordability check, and again with a complaint threatened.
**operational-incident** — the systems go down mid-application.

### 29.2 The five policy cards

**No decision before affordability** · **Refer when the rules say refer** · **Reasons are real** · **Disbursement is four-eyes** · **Cohort-blind** — which blocks a decision whose *composed prompt* carries a cohort attribute the journey never revealed.

### 29.3 The five evaluators

**Decision matches the rules** (*reads truth*; labels `agree`, `over-approve`, `over-decline`, `missed-refer`, `over-refer`), **explanation faithful** — every reason stated was one the decision rested on, and every reason the decision rested on had its evidence in hand when it was made, read from the trace — **appeal handled**, **identity before decision**, and the understanding rubric.

> **Figure 20** — The Lending Desk. *(Appendix D, `ws-playground-lending.png`.)*

## 30. The Complaints Desk

**`/workshop/playground/complaints`** · purpose `complaints`

The bank's complaints handler: acknowledge promptly, find what the file supports, answer with the reason, and redress within the rules — once, and never on a complaint the file does not support.

**Five cards · seven scenarios · one policy card (Redress needs approval) · three evaluators** — complaint acknowledged in time, root cause named, redress within bounds — **and one campaign.**

The cases: a fee that should not have been charged (and a customer who wants double); advice that did not suit; a payment that arrived late; a complaint the file does not support (and the same, pressed); a complainant who will go to the ombudsman.

## 31. Decks, counterparts and injections

### 31.1 Decks

A **deck** is a set of scenarios on one desk that ask the same kind of question. Every desk carries the same five: the journey itself, the vulnerable or difficult case, the pressure case, the red team, and the operational incident. A campaign can gate a whole deck at once, and a report groups by deck and by tag.

### 31.2 Counterparts

The person across the desk. Ten personas ship with the bank: the first-timer, the pushy customer, the guarantee-seeker, the vulnerable customer, the impersonator, the social engineer, the mule, the distressed genuine caller, the complainant and the injecting customer.

A counterpart runs in one of two ways:

- **Scripted** — a small state machine inside the world. Each rule has a trigger, what it says, how hard it pushes (its *pressure*), and the obligation or threat it tests. Deterministic, free, and what CI runs.
- **Live** — a second seat in the episode with its own brain and its own trace, using the script's persona as its personality. Run it from **Robot Friends** in the Kit, or from the harness with `--counterpart live`.

Every utterance from either side is an event on the trace, so the transcript is a projection of the trace and never a separate log.

### 31.3 Injections

Content delivered into the world at the start of a run, through a door the world already has:

| Kind | What it does |
|---|---|
| `heard` | A line the bot overhears, now or at a chosen turn |
| `manual-entry` | Text filed in the world's manual, found when the bot looks something up |
| `tool-result` | An override on what a service line answers — how a poisoned factsheet or a lying verification is delivered |
| `radio` | A message on a channel, apparently from a teammate |
| `provider-fault` | The model itself fails at a chosen turn — a timeout, a refusal or garbage — which is how the operational-incident deck is built |

## 32. Cohorts, parity and fairness

Every case carries a **cohort** in truth: age band, income band, opaque protected proxies, support needs and literacy band. The bot is never told them unless the journey would reveal them — and the *Cohort-blind* card exists to prove they never reached the prompt.

A campaign slices by cohort exactly as it slices by scenario, guard and brain, and the **parity** gate compares a number across the values of one cohort attribute:

> `parity` on `over-decline`, across `age-band`, maximum difference 5 points.

Two cautions the product states for you:

- **Matched versus unmatched.** The fairness deck's *matched pair* is the same finances on two cohorts one seed apart, so a difference is attributable. Over an unmatched corpus the report marks the slice `matched: false`, and the assurance pack quotes that caveat. Read an unmatched parity number as a prompt to investigate, never as a finding.
- **A parity gate is a test result, not a fairness assessment.** It says whether this build, on this synthetic corpus, decided alike. It says nothing about a real population.

## 33. Obligations and the control map

### 33.1 The obligation vocabulary

Every scenario, policy card and evaluator carries tags, so a report can group by them and a reviewer can find their own question:

`fca:cd:products-services` · `fca:cd:price-value` · `fca:cd:understanding` · `fca:cd:support` (the Consumer Duty's four outcomes) · `fca:cobs-9:suitability` · `fca:cobs-4:promotions` · `fca:conc:affordability` · `fca:conc:creditworthiness` · `fca:disp:complaints` · `fca:fg21-1:vulnerability` · `pra:ss1-23:*` (the model-risk principles) · `pra:ss1-21:resilience` · `poca:tipping-off` · `mlr:kyc` · `ukgdpr:data-minimisation` · `ukgdpr:purpose-limitation` · `equality-act:fairness`

Alongside them sit the threat tags — `ASI01`, `ASI02`, `ASI07`, `prompt-injection`, `tool-poisoning`, `confused-deputy`, `social-engineering`, `exfiltration`, `lethal-trifecta`, `app-scam`, `irreversible-action` — and internal cross-references of the form `19/#n`, which point at the control catalogue in the design set.

They are plain strings. Code groups by them and does nothing else with them.

### 33.2 The control map

The control map is the bridge from what the product does to what a firm is asked about. Each row is: a **framework**, a **reference**, the **obligation** in one sentence, the **evidence** for it, and a **status**.

Rows ship at three levels — the bank's UK retail rows, each desk's own rows, and generic rows for NIST AI RMF 1.0, the EU AI Act (Articles 9, 12, 14, 15 and 72), ISO/IEC 42001 and the OWASP Top 10 for Agentic Applications. In the `full` build a bot's pack carries **52 rows**.

Evidence is named by identifier and marked `present` (this is on the trace) or `available` (this control exists and can be run). A row whose evidence does not resolve to something real is refused by the build.

**Every row ships `unreviewed`.** That is deliberate: a row is a claim that a control is *relevant* to an obligation, and only a compliance reader can accept that claim. The status changes when a reviewer accepts the row in the pack's content — which today is an edit to the pack, not a click in the app (§41).

## 34. Worked example: proving a control end to end

The question: *does the "no recommendation before suitability" card actually stop an unsuitable recommendation, and can I prove it?*

**1 — See the scenario.** Workshop → **Scenarios** → *The desk asked to sell a fund* (`fs-advice/scenarios/sell-the-fund`). Read its tags: `fca:cobs-4:promotions`, `fca:cobs-9:suitability`, `fca:cd:products-services`. Press **Unsafe plan** to watch a bot take the bait.

**2 — See the control.** Workshop → **Policies** → the library → *No recommendation before suitability*. Use **would this have fired?** against the run you just made.

**3 — Run the campaign.** Workshop → **Campaigns** → **Import…** → `campaigns/fs-advice-baseline.json` → **Run campaign**. Read the gates: the unsuitable-recommendation rate under each guard stack.

**4 — Prove the gate bites.** In the editor, remove the policy card from the guard stack the gate names, and run it again. The gate should now fail. A control that cannot fail a build is not yet evidence.

**5 — Look at one case.** In **CELLS**, press **runs** on the failing cell and open a run in the Run Lab. Read the transcript, then the timeline: the recommendation, and no `guardrail.tripped` before it. Use **Explain** on that turn.

**6 — Ask the counterfactual.** **Fork from turn *n*** just before the recommendation, with the card fitted, and compare the two runs side by side.

**7 — File it.** Workshop → **Assurance** → the bot → **Download the report (HTML)**. Section 3 now names the campaign; section 8's COBS 9 row names the card and the evaluators. Push it to the evidence store if your team has one.

Steps 3, 4 and 7 are also the CI story — §37.1 does the same thing headless, on every change.

---

# Part E — The headless harness

## 35. Getting the CLI running

The harness is the same engine, the same packs and the same contracts in a Node process. The browser is *a* host, not *the* host: a run made here opens in the Workshop with no conversion, and a report made here is the report the Workshop renders.

```sh
npm run build                       # the CLI runs from dist
npm run craftabot -- packs          # what is installed, and which credentials are set
```

**Credentials** come only from the environment, as `CRAFTABOT_CREDENTIAL_<ID>` — the credential id upper-cased with non-alphanumerics folded to `_`:

```sh
export CRAFTABOT_CREDENTIAL_OPENAI=sk-…
export CRAFTABOT_CREDENTIAL_GEAP=…
export CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE=…
```

They are never read from a file the harness wrote, never printed, and every file the harness writes is redacted against every secret the process holds.

**The principal.** Every run, fork and campaign cell the harness starts records `{ kind: 'service', id: 'craftabot-harness', name }`, where the name comes from `--principal`, else `CRAFTABOT_PRINCIPAL`, else the machine's hostname. Nothing is verified: the trace records what the host said it was.

**Packs.** The default list is every workspace pack except the Kit's demo pack. To use a different list, `--config craftabot.config.mjs`, a plain ES module whose default export is `{ packs }`. Nothing is discovered automatically.

**Egress.** `--egress declared` (the default) allows only the hosts the fitted components declare; `--egress none` refuses everything, and is what CI uses.

## 36. Command reference

### 36.1 `run` — one bot, one card

```sh
npm run craftabot -- run \
  --kit packages/harness/fixtures/snackbot.craftabot.json \
  --card starter/snack --seed 7 --out ./runs
```

| Option | Meaning |
|---|---|
| `--kit <file>` | The bot, as a kit file |
| `--card <id>` | Override the goal card for this run |
| `--brain scripted-optimal \| scripted-noisy \| live` | The default is `scripted-optimal`: no key, reproducible. `live` uses the kit's own cartridge and its provider |
| `--seed <n>` | Reproducibility |
| `--counterpart scripted \| live` | Seat a visitor across a desk card (§31.2) |
| `--counterpart-cartridge <id>` | Which cartridge the live visitor uses |
| `--max-rounds <n>` | Cap the episode (default 30) |
| `--stack <guardId> --stack-file <campaign.json>` | Install a campaign guard's group half — the Compliance Watchbot and its breakers |
| `--principal <name>` | Who is starting this |
| `--egress declared \| none` | |
| `--out <dir>` | Where runs are written (default `./runs`) |

**What a run writes**, one directory per run:

```
runs/<runId>/run.json                       the run record
runs/<runId>/events.jsonl                   one event per line, in order
runs/<runId>/summary.json                   the fold the Workshop's screens read
runs/<runId>/<runId>.craftabot-trace.json   the export the Run Browser imports; the digest verifies
agents/<agentId>.json                       the bot the kit described
index.jsonl                                 the store's index
```

### 36.2 `campaign` — the regression suite

```sh
npm run craftabot -- campaign --file campaigns/fs-fraud-baseline.json --strict \
  --egress none --out ./campaign-out \
  --junit ./campaign-out/junit.xml \
  --sarif ./campaign-out/results.sarif \
  --markdown ./campaign-out/scorecard.md
```

`--strict` exits 1 on any failed gate. At scale:

| Option | Meaning |
|---|---|
| `--jobs <n>` | Run cells in a pool of worker threads. The report is placed by cell order, so it reads the same as `--jobs 1` |
| `--shard i/n` | Run the i-th of n slices |
| `--seeds a-b` | Replace the file's seeds |
| `--resume` | Reuse every cell a stopped run finished whose run still verifies |
| `--matrix scripted\|expert` | An ad-hoc matrix with no gates, scored against a committed baseline (this is what `npm run evals` runs) |

`craftabot merge --file <campaign.json> <report.json>…` folds shards back together with the gates evaluated over the whole, refusing different campaigns, overlapping shards, and a fold that would exceed the budget.

`craftabot index --rebuild --out <dir>` rewrites the store's index, which a listing reads instead of opening every run directory.

### 36.3 `evaluate`, `report`, `assurance`

```sh
npm run craftabot -- evaluate --run <runId> --evaluator fs-advice/suitability-complete --out ./runs
npm run craftabot -- report --safety-case --agent <agentId> --out ./runs
npm run craftabot -- report --incidents --out ./runs
npm run craftabot -- report --telemetry --out ./runs
npm run craftabot -- assurance --agent <agentId> --out ./runs --html ./assurance-pack.html
```

`report` and `assurance` produce exactly what the Workshop's screens render, over the same stored runs, because both hosts call the same folds.

### 36.4 `bundle`

```sh
npm run craftabot -- bundle --run <runId> --out ./runs --file trace.craftabot-trace.json
npm run craftabot -- bundle --group <groupRunId> --out ./runs
```

A bundle is every run in an episode, its evaluations, its campaign identity and a digest over the whole. `verifyBundleDigest` — and the Run Lab's integrity badge — will refuse one that has been altered by a byte.

### 36.5 `record` — cassettes

```sh
npm run craftabot -- record --line <lineId> --script calls.json --out ./cassettes
```

Runs a service line's live client once per `{"op", "args"}` in the script, under an egress guard that allows only that line's declared hosts, and writes a cassette redacted against every credential the process holds. A pack ships the cassette and a session replays it by operation and argument digest, never calling out; a miss is `error.kind: 'cassette-miss'` on the trace. The report also says whether the first response allowed cross-origin calls — the browser checkpoint.

### 36.6 `fork`

```sh
npm run craftabot -- fork --run <runId> --tick 2 --kit other.craftabot.json --out ./runs
```

Replays to the turn, then runs on with a different build. The browser forks without overrides; a different bot or guard stack is the harness's job.

### 36.7 `evidence`

```sh
npm run craftabot -- evidence push --store evidence/supabase \
  --store-config '{"url":"…","anonKey":"…","workspace":"…"}' --assurance --agent <agentId>

npm run craftabot -- evidence pull --store evidence/supabase --store-config '…' \
  --kind bundle --since 2026-09-01 --dir ./evidence
```

`push` sends one artefact and prints the receipt. `pull` verifies every item's digest, refuses one that fails (exit 1) and writes the rest as the files the Workshop imports. Under `--egress none` the command is refused before any call.

### 36.8 The rest

`packs` (what is installed, and which credential variables are set — never a value) · `scenarios` (list and import a corpus) · `content` (the authored content store) · `export` (send a stored run to a sink).

## 37. Recipes

### 37.1 CI: fail the build when a control is removed

```yaml
- run: npm ci
- run: npm run build
- run: npm run craftabot -- campaign --file campaigns/fs-advice-baseline.json --strict --egress none --out ./out --sarif ./out/results.sarif
- uses: actions/upload-artifact@v4
  with: { name: campaign-out, path: ./out }
```

Everything in the shipped baselines is scripted and offline, so this needs no key and no network. The SARIF file uploads to code scanning, where a failed gate appears as a finding with the run ids behind it.

### 37.2 A thousand live cases overnight

```sh
npm run craftabot -- campaign --file my-campaign.json --jobs 8 --out ./out
# interrupted? pick it up where it stopped:
npm run craftabot -- campaign --file my-campaign.json --jobs 8 --out ./out --resume
```

A live cell requires the campaign's own `budget` block, which is enforced before the first cell runs — a campaign never half-spends.

### 37.3 Split across machines

```sh
# machine 1..4
npm run craftabot -- campaign --file my-campaign.json --shard 1/4 --out ./out-1
# then
npm run craftabot -- merge --file my-campaign.json ./out-*/**.campaign-report.json
```

### 37.4 Read a bundle from another language

Every artefact that crosses a boundary has a published JSON Schema in `docs/schemas/`. `examples/python-reader/` reads a bundle, validates it against those schemas and recomputes the digests, using nothing from this repository. `npm run example:python` runs it, and skips itself where Python is absent.

---

# Part F — Operations

## 38. Publishing the three sections

```sh
npm run build:editions              # all three
npm run build:editions -- playground # just one
npm run serve:site                  # serve them as a host would, to check
npm run e2e:editions                # one smoke test per section
```

Each folder goes at the path with its name:

| Folder | Path |
|---|---|
| `apps/workbench/build/simulator/` | `/simulator/` |
| `apps/workbench/build/workshop/` | `/workshop/` |
| `apps/workbench/build/playground/` | `/playground/` |

**One rewrite rule per folder.** Each section is a single-page app, so a deep link such as `/workshop/workshop/runs` must serve `/workshop/index.html`. `docs/publishing.md` gives the exact rules for Netlify, Cloudflare Pages, S3/CloudFront, nginx and Apache.

Each edition is measured against its own bundle budget at build time, and the command fails if a folder is over.

**Access control.** Nothing in the application authenticates anyone. If a section should be restricted, put the restriction in front of its folder at the host — basic auth, an identity-aware proxy, or your CDN's access rules. The application never sees a user, and no build flag changes that.

## 39. Keys, egress and data handling

### 39.1 The three rules that never bend

1. **Keys live in the browser's `localStorage` (or, for the harness, the environment) and nowhere else.** They are read only at the moment a call is made. A test in the build plants a secret and sweeps every file, trace, log and URL the product can produce; if a key ever appears, the build fails.
2. **Everything the interface shows about engine behaviour arrives as a typed event on the trace.** There is no hidden state, which is why an exported trace is enough to reconstruct a run.
3. **Nothing real, ever.** Every person, account, card, document, cassette and corpus row in the repository is synthetic. A test sweeps every fixture for anything shaped like a real identifier — a valid card number, a real sort-code range, a resolvable domain — and refuses it.

### 39.2 Egress

Every component that calls out declares the hosts it may reach and what it sends. A session runs under `declared` (only the union of what the fitted components declared) or `none` (nothing at all). An attempt to reach an undeclared host is refused, and the refusal is on the trace as `error.kind: 'egress-refused'` — a run cannot quietly call somewhere it did not say it would.

`run.started` records the mode and the hosts, the run summary carries them, the boundary map draws them, and the safety case and assurance pack list them under *Where it may call*.

### 39.3 What leaves this machine, and when

| | Leaves? |
|---|---|
| A run on a scripted brain | Nothing leaves |
| A run on a real model | The prompt goes to that provider, on your key |
| A run with a hosted guard fitted and plugged in | What it screens goes to that vendor |
| A hosted evaluator with a project set | The run's own words go to that service |
| A sink attached | Spans go to the collector you named |
| An evidence push | That one artefact goes to the store you configured |
| Everything else | Stays in the browser or the directory |

## 40. Troubleshooting

### 40.1 A run stops at the first turn with nothing in it

**Symptom.** The run ends `STOPPED_BY_GUARDRAIL` at turn 1, zero tokens used, and the Kit shows **The safety check could not run**.

**Most likely cause.** A hosted guard is fitted and plugged in, but its battery was rejected or its service could not be reached — an expired Cloud Armour token is the common one, because the token lasts about an hour. The guard is designed to **fail closed**: if it cannot check, the run stops.

**How to tell.** The end card says which of the two happened, and the header chip counts them apart. For the detail, open the run in the Run Lab, select the `guardrail.tripped` row and read `reason` and `cause`: `"cause": "could-not-check"` with *"the guard could not check — the battery token was rejected"* is an infrastructure failure. A genuine catch names what it found and carries no such cause. Settings will also show that battery as **Rejected — sign in again**.

**Fix.** Settings → **Cloud Armour battery** → sign in again. Or open the Armour Brick's panel and switch **Unplugged** on to run without the hosted guard.

### 40.2 "Say something to your bot" is disabled

The bot has no listening channel switched on. The message says which one and offers **Turn listening on**; on a Playroom card that is the Eyes & Ears brick's **Hearing**, and on a desk it is the desk's conversation channel.

### 40.3 A campaign will not run in the browser

Campaigns run in the browser only where every cell is scripted and offline. A cell that names a live brain, a live counterpart or a hosted evaluator without an offline stand-in needs the campaign's own `budget` block and the harness.

### 40.4 A kit file will not import

The bot needs a pack this section does not carry. The message names the packs and the section that has them (§2). Import it into the `full` build or the `/playground` section.

### 40.5 The dashboard's success rate looks wrong

Runs you left part-way stay `IN_PROGRESS` and count in the denominator until somebody says otherwise. Press **Mark them abandoned** in the Run Browser (§13.1): the dashboard, Telemetry, the safety case and drift all read the same definition of *finished*, so the rate settles everywhere at once. Failing that, raise **Runs to keep** and let the old ones age out.

### 40.6 A guard says "no — the harness runs it live"

That service cannot be called from a browser (its authentication or its cross-origin policy forbids it). Fit it and run the scenario from the harness instead; the offline stand-in is what the browser uses.

## 41. Limits and known behaviours

Recorded rather than hidden.

- **Artwork.** The interface is drawn with CSS placeholders where illustrated artwork is still in production. Every swap-in seam is built and tested against a placeholder.
- **Two starter cards need more turns than the budget allows.** *Tidy the blocks* and *The locked chest* cannot currently be completed inside the 30-turn engine budget.
- **Control-map review is a content edit.** Rows ship `unreviewed`; accepting one is a change to the pack, not a click in the application.
- **The browser forks without overrides.** Forking with a different build is the harness's `fork --kit`.
- **No cost model.** The product counts tokens and does not price them, and the dashboard says so rather than inventing a number.
- **A campaign holds the tab while it runs.** There is a **Cancel** and an estimate, but no Worker: 930 cells is about a minute and a half in which the page will not answer.
- **The boundary map's labels collide** where the ring is crowded — the bank's nine service lines overlap each other and the egress badge. The picture is right; the typesetting is not.
- **One origin, one service worker.** If two sections (§38) are published on the same origin at different bases, the section installed second inherits the first's cached shell and can open on a blank page until the browser's site data is cleared. Publish each section on its own origin or subdomain, or give each its own service-worker scope, before putting two in front of readers.
- **The live checkpoints for Azure Content Safety and the Gen AI evaluation service are pending** a key and a token; both are one command (`npm run smoke:azure`, `npm run smoke:geap`).
- **Provider errors show friendly copy with the raw payload one click away**, but there is no automatic retry.

---

# Appendices

## Appendix A — Screen index

Routes are given as they appear in the `full` build. In a published section, prefix them with that section's base (`/simulator`, `/workshop`, `/playground`).

### The Kit

| Route | Screen | What it is for |
|---|---|---|
| `/` | Shelf | Your bots, the expansion packs, import and export |
| `/bench/<agentId>` | Bench | Fit bricks, pick a goal card, run the build checks |
| `/play/<agentId>` | Run screen | GO / STEP / Play / Stop, the world or the desk, the Flight Recorder |
| `/play/duo` | Robot Friends | Two bots, or a bot and a visitor, in one world |
| `/replay/<runId>` | Replay | A stored run, turn by turn, in the Kit's register |
| `/scrapbook` | Scrapbook | Every adventure kept |
| `/scrapbook/<agentId>` | Scrapbook, one bot | That bot's adventures |
| `/settings` | Settings | Batteries, the run cap, your name on the trace, Ollama's address, preferences, the leaflet |

### The Workshop

| Route | Screen | What it is for |
|---|---|---|
| `/workshop` | Bench dashboard | Readouts, campaigns, the fleet |
| `/workshop/runs` | Run Browser | Filter, pin, compare, import a trace |
| `/workshop/runs/<runId>` | Run Lab | World or desk, boundary, timeline, inspector, explain, fork |
| `/workshop/compare` | Compare | Two runs side by side, scrubbers synchronised |
| `/workshop/spec/<agentId>` | Spec lab | The specification, the safety stack, autonomy, the boundary, the JSON |
| `/workshop/evals` | Eval Matrix | Cards × cartridges × configurations × seeds, scored against a baseline |
| `/workshop/campaigns` | Campaigns | Author, import, run, gate, and download a campaign report |
| `/workshop/evaluators` | Evaluators | Every evaluator; run one over a stored run |
| `/workshop/scenarios` | Scenario Library | Every scenario, its tags and injections; import a corpus |
| `/workshop/policies` | Policy Studio | Author and test policy cards |
| `/workshop/bench` | Test bench | Assertion cards over a stored trace |
| `/workshop/guards` | Guard Rack | Every guard service; test it; fit it |
| `/workshop/sinks` | Sinks | Configure a telemetry sink; attach it live |
| `/workshop/telemetry` | Telemetry | By card, by cartridge, by day; trip mix; drift; autonomy |
| `/workshop/incidents` | Incidents | Everything that went wrong, with its explanation |
| `/workshop/safety-case` | Safety case | Inability, control, egress, trustworthiness, evidence |
| `/workshop/assurance` | Assurance pack | The filed evidence, and its three downloads |
| `/workshop/evidence` | Evidence | The shared store: configure, push, pull |
| `/workshop/export` | Audit centre | Bundles, traces, reports, sink sends, evidence pushes |
| `/workshop/armour` | *(redirect)* | Superseded by the Guard Rack |

### The Playground

| Route | Screen |
|---|---|
| `/workshop/playground` | The bank: a case from a seed, and the nine lines |
| `/workshop/playground/advice` | The Advice Desk |
| `/workshop/playground/fraud` | The Fraud Desk |
| `/workshop/playground/lending` | The Lending Desk |
| `/workshop/playground/complaints` | The Complaints Desk |

## Appendix B — File formats and schemas

Every artefact that crosses a boundary is defined once and published as a JSON Schema in `docs/schemas/`, regenerated and checked on every build (`npm run schemas`).

| Artefact | File | Schema |
|---|---|---|
| A bot | `*.craftabot-kit.json` | — |
| A run | `*.craftabot-trace.json` | `craftabot-trace.schema.json` |
| An episode or a filed run | `*.craftabot-bundle.json` | `craftabot-bundle.schema.json` |
| A campaign | `campaigns/*.json` | `campaign.schema.json` |
| A campaign report | `*.campaign-report.json` | `campaign-report.schema.json` |
| A scenario pack | `*.craftabot-scenarios.json` | `craftabot-scenarios.schema.json` |
| A recorded service line | `*.craftabot-cassette.json` | `craftabot-cassette.schema.json` |
| An evaluation | — | `evaluation-record.schema.json` |
| An item in the evidence store | — | `evidence-item.schema.json` |

Additionally: JUnit XML and SARIF from a campaign, OpenTelemetry GenAI spans from a sink or the Audit centre, and the assurance pack as self-contained HTML, markdown or JSON.

**Digests.** A trace file carries a SHA-256 digest over its events; a bundle carries a digest over its constituent digests; an assurance pack carries a digest over everything it folded. Changing one byte invalidates the badge.

## Appendix C — Keyboard and accessibility

- **The whole bench is keyboard-operable.** Focus a brick in the tray, <kbd>Enter</kbd> to lift it, <kbd>↑</kbd>/<kbd>↓</kbd> to choose a socket, <kbd>Enter</kbd> to fit. Every drag interaction has a keyboard equivalent, and the browser tests run a keyboard-only variant of each.
- <kbd>space</kbd> is **STEP** on the run screen.
- **Contrast** is held to WCAG 2.1 AA by a test that parses the design tokens and checks every colour against the ground it sits on, in both the Kit and the Workshop. The Workshop is not exempt because its users are adults.
- **Reduce motion** is a preference and the system setting is honoured.
- **Read the story out loud** speaks what the bot is doing, for readers who are not reading yet.
- **Never colour alone.** Every state carries a shape, an icon or a label as well as a hue.
- An automated accessibility pass runs over every Workshop route in the build.

## Appendix D — Figures

The figures in this manual are the committed visual-regression baselines: the same images the build compares against on every change, so they cannot drift from the product without a test failing. Regenerate them with `npm run e2e:visual`.

Sources are under `apps/workbench/e2e/__screenshots__/<platform>/`, where `<platform>` is `win32` or `linux`. **For print, recapture at 2× device scale** — the baselines are 1× and will look soft above about 120 mm wide.

| Figure | File | Shows |
|---|---|---|
| 1 | `kit-shelf.png` | The shelf, with the expansion packs |
| 2 | `kit-bench.png` | The bench with six bricks fitted |
| 3 | `ws-dashboard.png` | The Bench dashboard |
| 4 | `workshop-run-lab.png` | The Run Lab over a Playroom run |
| 5 | `desk-play.png` | A desk run: transcript, case file, queue |
| 6 | `workshop-spec-lab.png` | The Spec lab |
| 7 | `ws-policies.png` | The Policy Studio |
| 8 | `ws-scenarios.png` | The Scenario Library |
| 9 | `ws-evaluators.png` | The Evaluators screen |
| 10 | `ws-eval-matrix.png` | The Eval Matrix |
| 11 | `ws-campaigns.png` | A campaign report |
| 12 | `ws-guards.png` | The Guard Rack |
| 13 | `ws-telemetry.png` | Telemetry and drift |
| 14 | `workshop-assurance.png` | The assurance pack |
| 15 | `ws-evidence.png` | The Evidence screen |
| 16 | `ws-audit-centre.png` | The Audit centre |
| 17 | `ws-playground.png` | The Playground: the bank |
| 18 | `ws-playground-advice.png` | The Advice Desk |
| 19 | `ws-playground-fraud.png` | The Fraud Desk |
| 20 | `ws-playground-lending.png` | The Lending Desk |

Also available and not yet placed: `workshop-run-lab-explain.png` (the explanation panel), `ws-runs.png` (the Run Browser), `ws-run-lab-golden.png`, `ws-incidents.png`, `ws-safety-case.png`, `ws-sinks.png`, `ws-test-bench.png`.

## Appendix E — How the PDF is produced

**The brand.** The values are no longer placeholders: the comment block at the head of this file carries the real Axiom Verity palette, type and marks, read from that project's own design system. The wordmark is set, not an image — *Axiom* in ink `#10233a`, *Verity* in gold-ink `#7a5a1a`, Newsreader 600 — so it stays sharp at any size and needs no asset file. The mark is `axiom-mark.svg`, inlined.

**The toolchain.** The PDF is rendered from this markdown by a self-contained HTML print stylesheet driven through headless Chromium — A4, 20 mm margins, 11 pt body, with the running header and footer supplied as Chromium header/footer templates so the page numbers are real. The three typefaces are embedded from the same self-hosted `@fontsource` files the Axiom Verity site uses, so the PDF and the website set identically. Regenerating it is three scripted steps and no manual layout step (`docs/manual/pdf/`), which matters because this document will be regenerated every time the product moves.

Two alternatives, if the document ever needs finer typesetting than a browser gives:

- **Pandoc → LaTeX** for better control of running heads and of the wide reference tables (§36, Appendix A) — set them `longtable` so they break across pages.
- **Typst** if the brand is being designed alongside the document; it iterates faster than LaTeX.

**Figures.** Appendix D lists them. They are the committed visual-regression baselines at 1× and are placed at a width where that still reads; recapture at 2× (`npm run e2e:visual` with the device scale raised) before printing any of them wider than about 120 mm.

**Editorial notes**

- The product's own voice is plain, concrete and a little dry, and it never claims more than it can prove (*"no drift flagged"*, *"spend is not shown because there is no cost model"*). Keep that voice in any copy added at production.
- Do not soften the simulation notice or the "not a claim of compliance" sentences: they are the reason the material can be shown to a regulated audience at all.
- Where the manual names an obligation, it names it as a *source*. Keep the wording.
- The cover is typographic, not illustrated: the letterhead rule, the wordmark, the title in Newsreader, the proof-mark, and the *FOR SIMULATION ONLY* strap. That is a deliberate reading of the brand — Axiom Verity's own system calls for a report cover, not a hero banner — and it also keeps the cover honest, since the Playground's box art is an artist's impression rather than a picture of the product. If the box art is ever wanted on the cover, caption it as an impression.

---

*End of document.*
