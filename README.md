# Craft A Bot

An LLM and agent simulator built as a 1970s construction toy — and, behind the Workshop door, a proving ground for automated AI governance.

You snap bricks together on a workbench — a brain, eyes and ears, a scrapbook, a tool belt, hands and wheels, a safety brick — slot in a goal card, and pull the GO lever. Your bot then tries to achieve the goal in a simulated playroom, one turn at a time, while a flight recorder shows you every prompt it was sent, every decision it made, every tool it reached for and every rule that stopped it.

Everything runs in your browser. Your bots, your runs and your API keys never leave it.

> **Screenshots are still to come.** The interface is drawn with design tokens and placeholder shapes while the illustrated kit is in production (`docs/design-day2/11-VISUAL-ASSET-MANIFEST.md`); every seam for the art is built and passes its contract, so the pictures drop in without a code change.

---

## What it is for

**1. Learning how agents actually work.** Most explanations of "AI agents" are diagrams. This is a thing you can take apart. The tutorial is six designed failure→fix pairs — you are shown the failure _first_, then you fix it:

| Chapter | You watch it go wrong                          | You fix it by                     | The real idea                                     |
| ------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| 1       | The bot thinks beautifully and nothing happens | Adding the Hands & Wheels brick   | What an agent loop is                             |
| 2       | It acts, but greets an empty corner            | Adding the Eyes & Ears brick      | Observations — a model only knows what it is told |
| 3       | It has the same good idea over and over        | Adding the Scrapbook brick        | Why memory matters                                |
| 4       | It says 17 × 23 = 371, confidently             | Switching on the calculator       | Hallucination, and tools as the cure              |
| 5       | It shoves a locked lid, repeatedly             | Switching on "look up the manual" | Retrieval                                         |
| 6       | It changes the world without asking            | Switching on approval mode        | Guardrails and human oversight                    |

**2. Proving AI governance.** Guardrails, approval flows, hosted guard services, evaluators, scenario campaigns with gates, an assurance pack a reviewer can open with nothing installed, and a complete, tamper-evident trace are first-class parts of the toy rather than a compliance afterthought. `@craftabot/governance` depends only on the engine core and is built to be lifted out and used in real agent stacks (`docs/governance-mapping.md`, `examples/plain-node-agent`).

**3. A synthetic bank to try it on.** The Retail Financial Services Playground is four desks — advice, fraud, lending, complaints — over a synthetic bank with every record generated from a seed. Each desk ships its scenarios, policy cards, evaluators and a baseline campaign that CI runs. Nothing in it is real, and a test in CI refuses anything that looks as though it might be.

---

## The three sections

One codebase, three faces, one build each (`npm run build:editions`, `docs/publishing.md`):

| Section        | Who it is for                     | What it holds                                                                                                                                                               |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Simulator**  | A learner, a child, a classroom   | The Kit: the shelf, the bench, the Playroom, the leaflet, the six chapters and the side quests. No key needed — the Demo Brain runs scripted plans through the real engine. |
| **Workshop**   | A practitioner, a safety engineer | The Control Room: runs, the Spec Lab and Run Lab, guards, evaluators, scenarios, campaigns, telemetry and drift, the safety case, the assurance pack, evidence sync.        |
| **Playground** | A conduct reviewer, a bank's team | The synthetic bank and its four desks, each with a campaign to run, a case to open, a decision to explain and fork, and a pack to file.                                     |

The **headless harness** (`npm run craftabot -- …`) runs, records, bundles, evaluates and reports the same things from a terminal or CI, and a **Python reader** (`examples/python-reader`) validates and re-digests a bundle with nothing from this repo.

---

## Installing

### What you need first

|             | Version                          | Notes                                                                                                                                                                            |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js** | **20 or newer** (24 recommended) | The only hard requirement. Get it from [nodejs.org](https://nodejs.org) or via [nvm](https://github.com/nvm-sh/nvm) / [nvm-windows](https://github.com/coreybutler/nvm-windows). |
| **npm**     | 10 or newer                      | Ships with Node. This repo is pinned to `npm@11.19.0` via `packageManager`.                                                                                                      |
| **Git**     | any recent                       | To clone the repo.                                                                                                                                                               |

Check what you have:

```sh
node --version   # must be >= v20
npm --version
```

You do **not** need to install Svelte, SvelteKit, TypeScript, Vite, Turborepo, Vitest or Playwright separately — they are all dependencies of this project and arrive with the install step below. There is no database, no server and no cloud account to set up. Python 3 is optional, for the reader example only.

### Install

```sh
git clone https://github.com/<your-org>/craft-a-bot.git
cd craft-a-bot
npm install
```

`npm install` installs every workspace at once (this is an npm-workspaces monorepo), which takes a couple of minutes the first time.

If you plan to run the browser tests, fetch the browsers too — this is optional and not needed to use the app:

```sh
npx playwright install
```

---

## Running it

### Development

```sh
npm run dev
```

Opens the workbench on a local Vite server with hot reload, with the engine packages rebuilding on change.

### A production build, served locally

```sh
npm run build     # builds every package and the static site
npm run preview   # serves the built site
```

`npm run build` writes the finished static site to `apps/workbench/build/`. It is a plain folder of HTML, JS and CSS with no server component — you can host it on GitHub Pages, Netlify, Cloudflare Pages, S3, or any static host by uploading that folder. `npm run build:editions` builds the three sections into `build/<edition>/`, each against its own size budget, and `npm run serve:site` serves them the way a static host would.

### Every command

| Command                     | What it does                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Dev server with hot reload                                                                                                                               |
| `npm run build`             | Build all packages and the static site; checks the bundle budget and that `docs/schemas/` is current                                                     |
| `npm run build:editions`    | The three sections of the site, each against its own budget                                                                                              |
| `npm run preview`           | Serve the production build locally                                                                                                                       |
| `npm run serve:site`        | Serve `build/` as a static host would, one SPA fallback per section                                                                                      |
| `npm run demo`              | Build the keyless demo, ready to drop on a static host                                                                                                   |
| `npm run test`              | Unit tests across all packages, with coverage gates                                                                                                      |
| `npm run e2e`               | Browser tests — entirely on the mock provider, no API key needed                                                                                         |
| `npm run e2e:visual`        | The screenshot set over every Workshop route; baselines committed per platform                                                                           |
| `npm run e2e:editions`      | One smoke test per section, against its built folder                                                                                                     |
| `npm run lint`              | Prettier, ESLint and `svelte-check`                                                                                                                      |
| `npm run check`             | `svelte-check` / `tsc` across workspaces                                                                                                                 |
| `npm run format`            | Prettier, writing                                                                                                                                        |
| `npm run budget`            | Report the JS bundle size against the budget, per route                                                                                                  |
| `npm run schemas`           | Regenerate `docs/schemas/` from the Zod sources                                                                                                          |
| `npm run evals`             | The scripted campaign matrix through the harness                                                                                                         |
| `npm run craftabot -- …`    | The headless host: `packs`, `run`, `record`, `bundle`, `report`, `campaign`, `merge`, `fork`, `assurance`, `evidence` — see `packages/harness/README.md` |
| `npm run example:python`    | The Python reader over its bundle fixture; skips itself without `python3`                                                                                |
| `npm run smoke:openai`      | One real call to OpenAI. Needs a key in the environment; never runs in CI                                                                                |
| `npm run smoke:harness`     | A live harness run on OpenAI — `CRAFTABOT_CREDENTIAL_OPENAI` in the environment; never in CI                                                             |
| `npm run smoke:geap`        | The live Model Armor and Gen AI evaluation checkpoint — `GEAP_*` in the environment; never in CI                                                         |
| `npm run smoke:azure`       | The live Azure AI Content Safety checkpoint — `AZURE_CONTENT_SAFETY_*` in the environment; never in CI                                                   |
| `npm run smoke:counterpart` | A live two-seat desk run with an Ollama visitor; never in CI                                                                                             |

---

## Using it

### Your first bot — no API key required

The **Demo Brain** cartridge needs no key at all. It runs scripted plans through the _real_ engine, the _real_ world and the _real_ trace, so everything except the model's intelligence is genuine. The whole tutorial works on it.

1. Open the app. The instruction leaflet opens on its own the first time — it points at the real interface as you go, and you can dismiss it with **"I've built kits before"** or reopen it any time from the **Instructions** handle.
2. Press **New bot** on the shelf.
3. Drag the **Brain Brick** onto the head socket — or use the keyboard: focus a brick in the tray, press <kbd>Enter</kbd>, use <kbd>↑</kbd>/<kbd>↓</kbd> to pick a socket, <kbd>Enter</kbd> again to fit it. The whole workbench is keyboard-operable.
4. Click the fitted brick to open its panel and choose the **Demo Brain** cartridge.
5. Pick a goal card from the rack — start with **Say Hello!**
6. Pull the **GO** lever, then press **STEP** to advance one turn at a time, or **PLAY** to let it run.

Watch the thought bubble for what the bot is thinking and the **Flight Recorder** at the bottom for what actually happened. Click any row to see the exact data behind it — including the full prompt that was sent.

### The bricks

| Brick              | Gives the bot                            | Really is                                                       |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------- |
| **Brain**          | Something to think with                  | The LLM, plus temperature and token settings                    |
| **Eyes & Ears**    | Awareness of the room                    | The observation channels written into each prompt               |
| **Scrapbook**      | Memory of recent turns                   | The rolling context window, and an optional notebook            |
| **Tool Belt**      | A calculator, dice, a notebook, a manual | Tool-calling, via the provider's real tool API                  |
| **Hands & Wheels** | The ability to change things             | World actions — the ones with consequences                      |
| **Safety**         | Limits, blocked actions, approval        | Guardrails: step budgets, capability scoping, human-in-the-loop |

Behind the Workshop door there are more: the **Armour Brick** (Google Model Armor as a hosted safety brick), the **Guard** brick over any guard service (Azure AI Content Safety, Llama Guard over Ollama), the **Connector** for service lines with recorded cassettes, and the **Monitor** that reads another bot's trace.

### The goal cards

**Say Hello!** · **Help the teddy get a snack** · **Sums for Teddy** (17 × 23) · **Tidy the blocks** · **The locked chest** · **Free play**, where you write your own goal on the card — and, with the Workshop door open, the Front Desk and every desk card of the Playground.

### Bringing your own OpenAI key

Optional — only needed if you want a real model instead of the scripted demo.

1. Go to **Settings → battery compartment**.
2. Paste an OpenAI API key and press **Insert battery**. The meter lights once the key is verified.
3. Back on the bench, choose a real cartridge in the Brain panel: **Quick Thinker**, **Deep Thinker** or **Penny Thinker**.

**Where your key goes.** It is stored in this browser's `localStorage` and read only by the OpenAI pack at the moment it makes a call, which goes directly from your browser to `api.openai.com`. It is never written into a saved bot, a trace, an export, a log, an error message or a URL. There is a CI test that fails the build if it ever is. Press **Eject** to remove it.

Use a separate, spending-capped key — the compartment links to OpenAI's key page. Runs cost a fraction of a penny.

### Sharing what you built

- **Export kit** saves a bot as a `.craftabot-kit.json` file you can send to someone else. Keys are never included.
- **Export trace** saves a complete run — every event, with a SHA-256 digest so a recipient can verify it has not been altered.
- **The Audit Centre** (Workshop) bundles runs, evaluations and the assurance pack; **Evidence** syncs them to a shared store your team provisions (`docs/evidence-setup.md`). Every file format has a JSON Schema in `docs/schemas/`.

### The Workshop and the Playground

Open the Workshop door in **Settings**. The rail on the left is the Control Room: **Runs** (the browser, the Run Lab with explain-this-decision and fork-from-here, compare), **Spec lab**, **Guards**, **Evaluators**, **Scenarios**, **Campaigns**, **Telemetry**, **Incidents**, **Safety case**, **Assurance**, **Audit**, **Sinks** and **Evidence**. **Playground** opens the synthetic bank and its four desks; each desk page shows a case, its decks, its cards and evaluators, and offers _Run this desk's campaign_. `docs/manual/USER-MANUAL.md` walks all of it.

---

## Project layout

```
apps/workbench            the UI — the only place Svelte or the DOM appears
packages/core             engine, schemas, events, storage contract, the tick loop
packages/governance       guardrails, hosted guard shell, reports, the assurance pack; depends on core only
packages/evals            evaluators, scenarios, campaigns and their reports
packages/harness          the headless host (`craftabot …`)
packages/desk             desk worlds, truth, the synthetic primitives
packages/telemetry        trace sinks (OTLP, file)
packages/evidence         the shared evidence store (memory, Supabase)
packages/packs/*          content: the Playroom, the Workshop, providers, guard services, the bank and its desks
examples/                 a plain Node agent on `@craftabot/governance`; the Python bundle reader
docs/design-day2          the design documents — the source of truth (`docs/design` is superseded)
docs/manual               the user manual and the UX findings
docs/schemas              generated JSON Schemas for every file that crosses a boundary
```

Two rules shape the codebase. The engine is **headless** — `core`, `governance`, `evals`, `desk` and the packs never import Svelte and never touch the DOM, and ESLint enforces it. And everything the UI shows comes from a **typed event** on the bus, which is what makes an exported trace enough to reconstruct a run.

If you want to understand the design rather than the code, start with `docs/design-day2/README.md` and `docs/design-day2/00-PROJECT-OVERVIEW.md`. `CLAUDE.md` maps every design document to the work that built it.

---

## Status and known gaps

Four planning days are shipped — the Kit, the Workshop, the safety proving ground and the Playground; `docs/design-day2/42-DAY4-ROADMAP.md` records the last of them, with every work package closed. What is outstanding is recorded rather than hidden:

- **Artwork.** The kit is drawn with placeholders; the two commission briefs (`20-…`, `63-…`) say exactly what to deliver and the contract tests accept it by name.
- **Two live checkpoints** need a credential this repository does not hold: Azure AI Content Safety (`npm run smoke:azure`) and the Gen AI evaluation service (`npm run smoke:geap`). Each is one command and a paste into its dated note.
- **The UX findings** from a walk of the running build are in `docs/manual/UX-AND-GAPS.md`, with what has been resolved marked against each.
- Sound cues are synthesised rather than recorded; `apps/workbench/src/lib/sound.ts` is the seam if you want to swap in samples.

Every build is measured against a per-edition size budget (`npm run budget` prints the per-route sizes), WCAG 2.1 AA contrast is enforced by a test that parses the design tokens, axe runs over every Workshop route in CI, and the app shell loads offline.

## Contributing

Read `CLAUDE.md` first — it lists the hard rules — then `docs/design-day2/10-CODING-STANDARDS.md`. The design documents are the source of truth: if an implementation has to diverge from one, the document gets a dated note in the same change.

Before opening a pull request:

```sh
npm run lint && npm run test && npm run build && npm run e2e
```

## Licence

[Apache-2.0](./LICENSE) — chosen over MIT for the express patent grant and trademark clause, with an eye to `@craftabot/governance` being released separately.
