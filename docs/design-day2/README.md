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

## Where things stand (as of 2026-08-16 — see `18-…` §7 for the full log)

Phases A–D are closed (WP11–WP25): engine trust, the open brick contract, teaching-aid UX, the professional Workshop, and a full governance layer (policy cards, Safety Brick v2, three scenario cards) have all shipped. Phase E (expansion era) is under way, three slices in: WP26's Compare view, WP27's Monitor brick, and WP28's Workshop world pack are all done, each scoped down from a larger roadmap description with the cut recorded in `18-…` §7. Still open: WP26's three LLM provider packs + persona cartridges + battery-bay UI, WP27's Test Bench brick, and WP29 (multi-agent core — sized at 7–9 slices, the largest remaining piece). `18-…` §7's most recent entries (items 15–17) are the ones to read before picking any of these up; two of the last three sized much larger on inspection than their roadmap line suggested.
