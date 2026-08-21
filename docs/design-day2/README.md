# Craft A Bot — Design Day 2

> **The standalone Day 2 design set** (2026-08-13). This folder contains everything needed to take the project forward from V1.0: verbatim copies of the Day 1 baseline (00–11, each with a status banner) plus the new Day 2 documents (12–19) and the professional-mode mock-up. Where a Day 2 document and its Day 1 counterpart differ, **Day 2 wins**; the banners at the top of each copied file say exactly what supersedes what.

## The seven Day 2 workstreams → documents

| # | Workstream (Andrew's brief) | Document |
|---|---|---|
| — | Ground truth: what V1.0 is, why the bot underperforms, the defect register | `12-CURRENT-STATE-ASSESSMENT.md` |
| 1 | Systematically test each brick's design, config, interactions and sandbox behaviour | `13-BRICK-TEST-STRATEGY.md` |
| 2 | Validated target reference design for every brick (current + roadmap) and the v2 data structures — the rock-solid baseline | `14-BRICK-REFERENCE-DESIGNS.md` |
| 3 | UI/UX architecture covering the teaching aid **and** the professional toolkit on one engine | `15-UIUX-DUAL-MODE.md` |
| 4 | Substantially improve the My Very First Agent UI/UX (priority) | `16-TEACHING-AID-UIUX-IMPROVEMENTS.md` |
| 5 | Professional-mode UI design + mock-up | `17-PRO-MODE-UI-DESIGN.md` + `mockups/pro-mode-mockup.html` |
| 6 | Prioritised, phased functionality roadmap; expansion packs; the ages 5–11 kit line (stopping before AI Architect) | `18-DAY2-ROADMAP.md` |
| 7 | State of the art in AI governance/safety/monitoring/assurance/telemetry — the control catalogue | `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` |

## Suggested reading order

1. `12` (where we are) → 2. `14` (where the engine goes) → 3. `13` (how we prove it) → 4. `15` → `16` → `17` (the two faces) → 5. `18` (the plan) → 6. `19` (the reference shelf, dip in as needed). Day 1 docs 00–11 remain the baseline for vision, architecture, visual language, stack, providers, persistence and standards.

## Contents

| File | Status |
|---|---|
| `00-PROJECT-OVERVIEW.md` … `11-VISUAL-ASSET-MANIFEST.md`, `CLAUDE.md` | Day 1 copies with Day 2 status banners |
| `12-CURRENT-STATE-ASSESSMENT.md` | **New** — findings, root causes C1–C8, defect register D1–D17/T1–T5 |
| `13-BRICK-TEST-STRATEGY.md` | **New** — L0–L5 test pyramid, per-brick charters, eval harness, conformance kit |
| `14-BRICK-REFERENCE-DESIGNS.md` | **New** — open brick contract, engine evolutions E1–E12, six reference designs, eight roadmap bricks, multi-agent architecture, v2 schemas |
| `15-UIUX-DUAL-MODE.md` | **New** — Kit + Workshop on one engine; shared foundations; mode rules |
| `16-TEACHING-AID-UIUX-IMPROVEMENTS.md` | **New** — P0/P1/P2 improvements with acceptance criteria |
| `17-PRO-MODE-UI-DESIGN.md` | **New** — Workshop IA, screens, phasing |
| `mockups/pro-mode-mockup.html` | **New** — interactive wireframe: Run Lab · Eval Matrix · Policy Studio |
| `18-DAY2-ROADMAP.md` | **New** — Phases A–F, WP11–WP34, expansion-pack line, scope decision of record |
| `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` | **New** — sourced SOTA catalogue + 38 candidate controls tagged Kids/Pro/Both |
| `20-ART-COMMISSION-BRIEF.md` | **New (2026-08-14)** — the drop-in specification for art wave 1: exact canvases in px, file paths, palette, named-group contract, and the placeholder each artefact replaces. Companion to `11-…`, which stays the what-and-why |
| `21-ART-PRODUCTION-PLAN.md` | **New** — wave 1 production plan against the commission brief |
| `22-WAVE-1-HANDOVER.md` | **New (2026-08-15)** — wave 1 art handover: what was produced, where it landed, how the swap-in went |
| `23-MULTI-AGENT-DESIGN.md` | WP29's design of record and close-out (built 2026-08-19): the SessionGroup/AgentHandle/facade architecture anchored in the real codebase, both audiences' stakes, and the seven-stage implementation plan, each stage's actual divergences logged dated in §8. Supersedes `14-…` §6's sketch where they differ |
| `24-ROBOT-FRIENDS-DESIGN.md` | WP31's design of record and close-out (built 2026-08-20): the Kit-facing duo experience WP29 deliberately left unbuilt, anchored against the real single-bot Kit flow (`session.svelte.ts`, `narrate.ts`, the Scrapbook, the bench's `coop` filter), the Radio brick, the ASI07 spoofed-message scenario (`starter/party-line`), and the eight-stage implementation plan, each stage's actual divergences logged dated in §8. Supersedes `14-…` §5.4/§6's sketch where they differ |

## Where things stand (as of 2026-08-21 — see `18-…` §7 for the full log)

Phases A–D are closed (WP11–WP25): engine trust, the open brick contract, teaching-aid UX, the professional Workshop, and a full governance layer (policy cards, Safety Brick v2, three scenario cards) have all shipped. **Phase E (expansion era) is fully closed** (WP26–29 all done): WP26 (LLM Multi-Pack — three provider packs, persona cartridges, battery-bay UI, Compare view), WP27 (Monitor + Test Bench bricks), WP28 (the Workshop world pack), and WP29 (multi-agent core — `SessionGroup`, the Playroom's `forAgent` facade, group-altitude events, a minimal Workshop surface, built across seven gated stages per `23-…`). **Phase F (the ages 5–11 "Agent Builder" kit, WP30–34) is now fully closed too** — every WP is done: WP31 (Radio brick + Robot Friends duo experience, including the ASI07 scenario), built across eight gated stages per `24-…`; WP30 (the Planner half — the brick, its live checklist, and its own eighth leaflet chapter — across five gated stages, and the If/Then half — the reflex mechanism, the brick, and its own ninth leaflet chapter — across four more), both closed out in `14-…` §5.1 and §5.2's own dated amendments; WP32 (the Librarian and Connector bricks, across four gated stages — the two bricks, the Librarian's own tenth leaflet chapter on a genuinely new goal card, and Connector's own confused-deputy mini-scenario shipped as a side quest), closed out in `14-…` §5.6's own dated amendment; WP34 (Workshop maturity, across four gated stages — `/telemetry`, `/incidents`, `/safety-case`, and the Audit Centre at `/export`, none needing a core change), closed out across `17-…` §4.7–§4.10's own dated amendments; and **WP33** (Identity badges + kit-line packaging) — the Passport/Agent Card half, sized down before it started, and the kit-line half: the Shelf's Expansion Packs section made data-driven over all seven `18-…` §4 packs plus a curated "Agent Builder" bundle, with one honest finding (Tool Shop Pack's own content does not exist yet, so it ships `coming-soon` rather than `unlocked`) — both closed out in `14-…` §5.8's own dated amendment. `18-…` §7's most recent entries (items 21–29) cover every WP's own close-out and are worth reading before starting anything new. **The roadmap's forward plan now has nothing left it names** — new work needs a fresh planning pass, not an assumption about what "next" means.
