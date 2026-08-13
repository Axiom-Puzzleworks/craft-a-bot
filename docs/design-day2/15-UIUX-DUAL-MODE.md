# 15 — Dual-Mode UI/UX Architecture (Workstream 3)

> One engine, one data model, two faces: the colourful teaching aid ("the Kit") and the professional development & testing environment ("the Workshop"). This document defines how the two modes relate, what they share, and the rules that keep them from diverging into two products.
> Prerequisite reading: `03-UI-UX-DESIGN.md` (V1 baseline), `12-CURRENT-STATE-ASSESSMENT.md`, `14-BRICK-REFERENCE-DESIGNS.md`. Details per mode: `16-TEACHING-AID-UIUX-IMPROVEMENTS.md`, `17-PRO-MODE-UI-DESIGN.md`.

---

## 1. The core idea: one mental model, two registers

V1 already contains the pattern in miniature: every brick has a toy face and a "what this really is" flip side. Day 2 scales that from a panel to the whole product:

- **The Kit** (teaching aid): the existing 1970s construction-toy experience, improved per `16-…`. Cut-down information, guided flows, delight, safety-brick-centre-stage. Audience: children 5–11 with an adult, and adult beginners.
- **The Workshop** (professional toolkit): the same bots, worlds, runs and traces exposed at full fidelity — spec editing, trace forensics, eval matrices, policy authoring, telemetry. Audience: practitioners, educators, AI-safety researchers, and Andrew's governance proving-ground work.

**The flip is the bridge, in both directions.** From any Kit surface you can flip to see the real thing (already true for bricks; Day 2 extends it to the whole bench and the whole run). From any Workshop surface you can ask "show me the toy explanation" — the pedagogy is an asset for professionals too, and it keeps one vocabulary map (the `00-…` §6 glossary) authoritative for both.

## 2. Product structure decision

**One app, one route tree per mode, shared state and components.** The Workshop lives at `/workshop/*` in the same SvelteKit app; the Kit keeps `/`, `/bench`, `/play`, `/settings`.

- Mode is a **profile-level choice with per-surface escape hatches**: a "Workshop" toggle in settings (default off; discoverable, not hidden) plus contextual doors — "Open this run in the Workshop" on any end card / trace drawer, "Open this bot in the Workshop" on the shelf box. Children never fall into the Workshop accidentally; adults never have to re-import anything to get there.
- Rejected alternatives, for the record: *two apps* (duplicates state/persistence code, breaks the shared-artefact story, doubles release cost); *a single UI with density toggles everywhere* (a thousand conditionals, neither audience well served); *pro-as-export-only* (kills the live-inspection value that the event-sourced architecture gives us for free).
- The public/private packaging rule (`01-…` §5) applies: if Workshop capabilities ever become the private/commercial tier, `/workshop` routes ship as their own lazy-loaded bundle behind the same pack-style registration — a packaging decision, not a rewrite.

## 3. The shared foundation (build once, both modes consume)

These are the Day 2 platform investments both modes stand on — they appear once in `18-…` Phase B/C, not once per mode:

| Foundation | Kit use | Workshop use |
|---|---|---|
| **Run history store + list UI** (runs already persist; D14) | "Your bot's adventures" scrapbook page; reopen the last run's story | Run browser with filters, pin/compare/re-run |
| **Replay engine** (drive `createSessionView` from stored events with a clock) | "Watch it again!" + scrubber; tutorial can replay canonical moments | Time-travel debugging, step diffing, incident review (`19-…` #22) |
| **Narrated tick model** (per-tick sense→think→act→result structure derived from events) | Story-strip narration for pre-readers (`16-…` §3) | The step timeline's spine; span grouping |
| **Readable payload renderers** (per event type, not raw JSON) | Child-voice one-liners | Structured inspectors with raw JSON one click away |
| **Schema-driven brick panels** (`14-…` §2 configSchema → controls) | Toy controls (dials/rockers) generated with per-kind skins | Full-fidelity forms + JSON editing of the same config |
| **Eval records** (13 §8 `EvalReport`) | "Robot report card" (simplified, post-Phase D) | Eval matrix screen |
| **Mode-aware copy registry** (toy term ↔ real term pairs) | Toy register | Real register, same ids — the glossary as data |

## 4. Capability matrix (what each mode exposes)

| Capability | Kit | Workshop |
|---|---|---|
| Build bot (drag bricks) | ✅ full, guided | ✅ same bench, plus JSON spec view/edit with validation |
| Brick config | Curated controls, safe ranges | Every schema field incl. `reasoningEffort`, strategies (E7), autonomy dial |
| Goal cards | Starter cards + free play | Card authoring (goal text, layout, predicate picker), card packs |
| Run | STEP hero, play speeds, approval cards | Same + breakpoints ("pause on guardrail trip / on tool call"), seed control, budget overrides (host-level, traced per E8) |
| Trace | Flight Recorder: lanes, plain labels, story strip | Full inspector: filter/search/timings/diffs/linking (`17-…` §5.3) |
| Run history | Scrapbook (recent, pinned "keep this adventure") | Full browser + compare + export/import |
| Replay | Watch again + scrub | Time-travel + fork-from-tick (Phase E) |
| Governance | Safety brick panel; policy cards as toy cards (Phase D) | Policy studio: card authoring, rule testing against stored traces |
| Evals | Report card (late) | Matrix runner + scorecards + baselines |
| Telemetry | — | Cross-run dashboards: success/loop/cost trends (`19-…` #23, #36) |
| Providers | Battery compartment | + per-cartridge wire settings, request/response raw views |
| Export | Kit file, trace file | + eval reports, policy cards, OTel-mapped trace export (Phase F, `19-…` #20) |

Rule of thumb: **the Kit never gets a capability the Workshop lacks** (the Workshop is a superset), and **the Workshop never gets data the trace doesn't contain** (tenet: the trace is the interface — if the Workshop needs it, the event catalogue grows first).

## 5. Design language: two skins, one system

- **Shared:** `tokens.css` remains the single source; the colour↔concept law (LLM blue, memory green, tools purple, sense sky, actions red, safety yellow/black) is identical in both modes — a trace lane means the same thing everywhere. Type scale, focus rings, accessibility rules (`04-…` §7) shared.
- **Kit skin:** as `04-…` — moulded plastic, printed card, painted scenes.
- **Workshop skin — "the bench instrument":** the same 1970s heritage, grown up: brushed-metal panel greys, graph-paper cream, engraved labels, oscilloscope-green accents for live telemetry, Braun-style restraint. It should feel like the *lab bench the toy was designed on* — same era, same warmth, no cartoon. Implementation: a `data-mode="workshop"` token layer overriding surface/typography tokens only; component geometry unchanged. New tokens go through `04-…` process.
- **Iconography:** the moulded-roundel event/trace icon set (`11-…` §I) is shared verbatim — it is already the right density for professional trace rows.

## 6. Audience & age-band guidance

| Band | Assumptions | Kit design consequences |
|---|---|---|
| 5–7 (with adult) | Pre/early readers; motor skills fine with chunky targets | Story-strip narration + optional speech synthesis; icon-first labels; no destructive action without confirm; sessions < 15 min; adult-gate for settings/keys ("grown-up screws") |
| 8–11 | Confident readers; want mastery and collectibles | Full leaflet arc; flip sides encouraged; badges, scrapbook, kit-file "trading"; introduce policy cards as collectible rule cards |
| Adult learner | The V1 real audience | Kit first, Workshop door signposted after tutorial completion ("You've built an agent. Want to see it as an engineer does?") |
| Practitioner / researcher | Purpose 2 | Straight to Workshop; Kit remains the demo/communication surface for their stakeholders — a governance story you can hand to a board |

## 7. Mode-consistency rules (the contract that stops divergence)

1. Both modes render from the same events, stores and schemas; no mode-private data models.
2. Every toy term used in the Kit exists in the copy registry with its real counterpart; the Workshop uses real terms with toy tooltips.
3. A bot built in either mode runs identically in both — mode changes presentation, never behaviour. (Host-level overrides in the Workshop are recorded in the trace so the difference is auditable, per E8.)
4. New features land as: engine events → Workshop surface → Kit simplification. The Kit is a curated view of the Workshop, not a fork.
5. Accessibility bar (keyboard, contrast, reduced motion, announcer) applies to both modes equally — the Workshop is not exempt because its users are adults.
