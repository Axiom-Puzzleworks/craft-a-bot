> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward as the authoritative statement of vision, purposes, principles and glossary. Day 2 adds documents 12-19 (see `README.md` for the extended document map).
> This file is a verbatim copy of `docs/design/00-PROJECT-OVERVIEW.md` carried into the standalone Day 2 set; only this banner has been added.

# Craft A Bot — Project Overview

> **Document status:** Design baseline v1.0 · August 2026
> **Audience:** Anyone (human or Claude Code) working on the project. Read this first.

---

## 1. What Craft A Bot is

Craft A Bot is an **LLM and agent simulator** styled as a range of vintage construction toys from the 1970s and 1980s. Users build an AI agent the way they would build a model from a construction kit: they snap together chunky, colourful bricks — an LLM, Memory, Tools, Sense, Actions — give the finished bot a **Goal Card**, and watch it act inside a safe simulated world.

The project has **exactly two purposes**, and every design decision must serve at least one of them:

1. **A training ground.** An interactive, accessible environment where people learn the concepts of agentic AI and agentic systems by building, configuring, running, breaking, and fixing agents — hands-on, not through slides.
2. **A governance proving ground.** The same environment doubles as a test bed for automated AI governance and guardrails: policies, approvals, tracing, evaluation, red-teaming. Components proven here are designed so they can later be **exported for use in the real world**.

Anything that serves neither purpose is out of scope, however fun it is.

## 2. The product line (the "kits")

The brand is structured like a toy manufacturer's range. Box art already exists for all four:

| Kit | Framing | Real meaning |
|---|---|---|
| **My Very First Agent** | "Ages 2–5 · Big, Safe, Chunky Parts" | V1.0. One agent, five brick types, Goal Cards, one simulated world. *Build · Connect · Give it a Goal · Watch it Act.* |
| **Agent Builder — The Advanced Agent Kit** | "Ages 5–11 · 150+ Parts" | Future release. Planner/sequencer, if/then decisions, tools & APIs, MCP connectors, short/long-term memory split, feedback loops, guardrails & safety bricks, test & checks. *Plan · Reason · Use Tools · Test · Improve.* |
| **AI Architect — Machine Learning & Autonomous Agents Lab** | "Ages 11+ · 300+ Components" | Future release. Datasets, train/validate/test, inference, multi-agent orchestration, evaluation (accuracy/robustness/bias), red-team challenge cards, model versions, deployment, permissions, human approval, monitoring. *Design · Train · Evaluate · Deploy · Govern.* |
| **AI Architect — Retail Financial Services Playground** (the first AI Architect box) | "Ages 11+ · One Bank · Three Desks" | Planned (`41-TARGET-DESIGN-V4.md`, `42-DAY4-ROADMAP.md`). One synthetic bank; the Advice, Fraud and Lending Desks; decks of scenarios; counterparts; cohorts and parity; the assurance pack. *Fit · Run · Measure · File.* |
| **LLM Multi-Pack** (expansion) | "6 Models · 6 Special Skills" | Expansion pack pattern: additional LLM providers/models arrive as snap-in **model cartridges** (Storyteller, Explainer, Researcher, Planner, Coder, Creator). *Choose · Connect · Prompt · Compare.* |

The "ages" are part of the joke and the charm. The **real audience for V1 is adults learning agentic AI** — professionals, hobbyists, and students who are new to agents. The toy framing is the hook; the concepts underneath are taught properly, with real terminology surfaced alongside the playful names (every brick has a toy name *and* a "what this really is" explanation).

**Current focus: My Very First Agent (V1.0) only.** The other kits inform architecture (we must not paint ourselves into a corner) but nothing from them is built yet.

> **Amended 2026-09-05:** the AI Architect row above promised datasets, training and deployment; `18-…` §1 ruled training out and `26-…` §11 keeps it out. The first AI Architect box is the Retail Financial Services Playground (`41-…` §1, §12) — the half of that promise that now exists (evaluation, red-team decks, human approval, monitoring, model versions) put in a domain. The training half stays out; the box art and age band are the range's own fiction.

## 3. Product principles

1. **A toy on the surface, a real agent underneath.** The bricks are not a metaphor painted onto a chat app. The engine genuinely runs a sense→think→act loop; the bricks genuinely are the modules of that loop. If a brick is on the bench, its capability exists; if it's off, it doesn't.
2. **Learn by doing, fail safely.** The agent acts inside a simulated world (the Playroom), so a badly-built agent produces a funny failure, never a real-world consequence. Failure states are teaching moments and should be delightful.
3. **Everything inspectable.** Every prompt sent, every token returned, every decision, every action — visible in a trace. There is no hidden machinery. This serves both learning (purpose 1) and governance (purpose 2).
4. **Modular from day one.** Bricks, worlds, tools, providers, goal cards, and guardrails are all **packs** behind stable interfaces. V1 ships with the core pack; everything else bolts on. This is how the product grows from "My Very First Agent" to "AI Architect" without rewrites.
5. **Local-first, bring-your-own-key.** V1 has no backend and no accounts. The user's API key stays in their browser; agents export/import as JSON "kit files". Supabase is the designated backend *when* (not if) sharing and community features need one — the data model is written with that migration in mind.
6. **One LLM in the box.** V1 ships with **OpenAI** support out of the box. Other providers (Anthropic Claude, Google Gemini, Ollama/local, …) arrive as the **LLM Multi-Pack** expansion — deliberately reminiscent of buying the motor pack for your Lego Technic set. The provider interface is multi-provider from day one; only the shipped catalogue is limited.
7. **Governance is a feature, not a chore.** Guardrails appear in V1 in embryonic form (step budgets, action blocklists, approval mode, full tracing) and are presented as part of the toy ("safety bricks"), establishing the pattern that grows into the AI Architect governance suite.
8. **Nostalgic, warm, tactile.** Visual language is 1970s/80s construction toy: card textures, halftone print, chunky plastic bricks, moulded studs, box-art typography. Fun is a requirement, not decoration.

## 4. Build-in-public strategy

- The repo is **private today**; the plan is to build in public by releasing V1 (or a component of it) into the public domain.
- Expectation: the **initial version is wholly public**. As the product grows, **advanced capabilities may remain private** while the simple training/testing functionality stays public.
- **Architectural consequence:** the split must be a *packaging* decision, not a rewrite. The pack/plugin architecture (see `01-ARCHITECTURE.md`) keeps every capability behind a public interface, so a private pack can be withheld from the public repo without the public code ever referencing it.
- **Licence recommendation:** Apache-2.0 for the public core (patent grant, business-friendly, allows the later private/commercial packs). Decide before first public release; record the decision in this file. *(This is a suggestion, not legal advice — worth a proper review before release.)*
- Nothing secret goes in the public repo's history — treat the repo as public from now on (no keys, no private roadmap notes in commits).

## 5. The V1.0 elevator pitch

> Open the box. Snap an **LLM brick** onto the workbench, plug in your API key like a battery. Add **Memory**, a couple of **Tools**, a **Sense** brick and an **Actions** brick. Slot in a **Goal Card** — *"Help the teddy get a snack."* Press **GO** and watch your very first agent look around the Playroom, think out loud, and act — every thought and step visible in the trace panel. Pop a brick off and watch it struggle without memory. Add a **safety brick** and watch it ask permission first. You've just learned what an agent is.

## 6. Glossary (canonical names — use these everywhere)

| Toy name | Real concept | Notes |
|---|---|---|
| **Workbench** | The build canvas | Where bricks are assembled. Also "the bench". |
| **Baseplate** | The agent chassis | The bot outline on the bench that bricks snap into. |
| **Brick** | An agent module | Five core types in V1: LLM, Memory, Tools, Sense, Actions. |
| **Stud / Socket** | Connection point | Determines what can snap where. |
| **Model cartridge** | Provider + model config | Plugs into the LLM brick. V1 ships OpenAI cartridges. |
| **Battery** | API key | "Batteries not included" — bring your own key. |
| **Goal Card** | Task / objective | A card slotted into the bot; becomes part of the system prompt. |
| **Playroom** | Simulated world | V1's grid-world environment where the bot acts. |
| **GO button** | Run the agent loop | Starts/steps/stops the sense→think→act loop. |
| **Trace** | Run log / observability | Full record of every tick. |
| **Safety brick** | Guardrail | V1: step budget, action blocklist, approval mode. |
| **Kit file** | Exported agent JSON | Portable agent definition (never contains keys). |
| **Expansion pack** | Plugin module | Adds bricks/cartridges/worlds/cards behind the pack interface. |
| **Instruction leaflet** | In-app tutorial | Step-numbered, diagram-led, like a real kit's paper instructions. |
| **Playground** | The retail financial services expansion — the box | "AI Architect — Retail Financial Services Playground". One synthetic bank, several desks, many decks, in one box. |
| **The bank** | The shared synthetic domain model | Customers, accounts, products, transactions, complaints, a bureau — one pack every desk depends on. |
| **Desk** | A journey as a world, and its view | "The Advice Desk", "The Fraud Desk", "The Lending Desk". The Playroom is a grid; a Desk is a transcript, a case file and a queue. |
| **Deck** | A set of scenarios on a desk | "Fraud & scams", "Vulnerable customer", "Red team". Scenarios, counterpart scripts and goal cards, tagged by obligation and threat. |
| **Case file** | Ground truth | What the world knows to be true about a case. The bot never sees it whole; evaluators do. |
| **Cohort** | The customer attributes fairness is measured across | Held in the case file; a campaign slices by it; a `parity` gate reads it. |
| **Counterpart** | The other party in a conversation | A customer, a caller, a fraudster, a complainant. Scripted (world-side, deterministic) or live (a second seat with its own brain). |
| **Service line** | A simulated or recorded external system | The Connector brick's "Weather Line" generalised: the CRM, core banking, KYC, payments, the bureau, SAR filing. |
| **Cassette** | A recorded request/response set | Lets a real sandbox API be called once, under declared egress, and replayed forever. |
| **Assurance pack** | The filed evidence | Safety case + campaign results + drift + incidents + inventory entry + the control map, rendered. |
| **Control Room** | The Workshop's visual system v2 | The instrument-panel skin, grown from a token layer into a design system. |

> **Amended 2026-09-05:** the eleven rows from **Playground** down are `41-TARGET-DESIGN-V4.md` §1.3's additions — toy names in the Kit and on box art, real names in code, as ever.

## 7. Document map

All design docs live in `design/` (mirrored into the repo as `docs/design/`). Read in order for a full picture; each is self-contained enough to brief a single Claude Code work package.

| File | Contents |
|---|---|
| `00-PROJECT-OVERVIEW.md` | This file. Vision, purposes, principles, glossary. |
| `01-ARCHITECTURE.md` | System architecture, pack system, public/private split, repo layout. |
| `02-AGENT-MODEL.md` | The agent loop, the five bricks, Goal Cards, the Playroom world, core TypeScript interfaces. |
| `03-UI-UX-DESIGN.md` | Screens, workbench interaction, drag-and-drop, run view, onboarding. |
| `04-VISUAL-DESIGN-LANGUAGE.md` | Palette, typography, brick styling, iconography, asset brief for the visual workstream. |
| `05-TECH-STACK.md` | TypeScript, Svelte 5, SvelteKit, libraries, tooling, testing. |
| `06-LLM-PROVIDERS.md` | Provider abstraction, OpenAI default, BYO key handling, expansion cartridges. |
| `07-DATA-MODEL-PERSISTENCE.md` | Schemas, kit file format, local storage, future Supabase mapping. |
| `08-GOVERNANCE-GUARDRAILS.md` | Purpose 2: tracing, safety bricks, policy engine seed, framework alignment, export path. |
| `09-ROADMAP.md` | V1.0 milestones broken into Claude Code work packages. |
| `10-CODING-STANDARDS.md` | Conventions, structure, naming, testing requirements. |
| `CLAUDE.md` | Instructions file for the repo root, pointing Claude Code at all of the above. |

## 8. Out of scope for V1.0 (explicitly)

- Accounts, login, cloud sync, sharing, community features (→ Supabase later).
- Multi-agent, planners, if/then bricks, MCP connectors (→ Agent Builder kit).
- Training, datasets, evaluation suites, red-team cards, monitoring dashboards (→ AI Architect kit).
- Real-world tools with side effects (email, web browsing, file access). V1 tools act only on the simulator.
- Mobile-first layout (desktop-first; must merely not break on tablet).
- Non-English localisation (copy structured to allow it later).
