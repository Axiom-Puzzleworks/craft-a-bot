# 109 — The tail of Day 7: Part I, the roundels, the Kit's card

> **Status (2026-09-30):** WP131 (`101-DAY7-ROADMAP.md` Phase AI; `100-TARGET-DESIGN-V7.md` §6.8, retires G89). Built in one stage; §6 is its note.

## 1. What it is

The last package of Day 7 carries four things:
- the manual's Part I, and the PDF rebuilt;
- five roundels on the wave-2 seam;
- the Kit's one Day 7 card, *Sure or unsure*;
- the Phase AI exit review.

Purpose 1 has had no new Kit content since the Playground's box (G89). The card turns Day 7's idea, a reader with a confidence and a gate that hands the unsure cases to a person (`104-READERS.md` §4), into something a child can play.

## 2. The roundels

`lib/assets/instruments.ts` gains five placeholders to the wave-2 contract. Each is 96 × 96, with `#disc` tintable and the glyph in cream:
- **`reader`** is an eye reading. It sits on the Campaigns screen's calibration pane.
- **`corpus`** is three labelled rows. It sits on the corpora page's strip.
- **`benchmark`** is bars on one baseline. It sits on the benchmark report's strip.
- **`gate`** is a post and a barrier arm. It sits on the Audit Centre's *Open a bundle…*, which is where a Gate's day arrives.
- **`reading`** is an open book with a tick. It sits on the readings desk's strip.

`wave2.test.ts` holds **29 files**: 26 icons, two finishes and one box. `101-…` names 27, a count made before WP109's two roundels were added. The commission's count moves with it (`63-…` §5.2).

## 3. *Sure or unsure*

**The world.** *The Front Desk: the queue* (`workshop/the-desk-queue`, `packs/workshop/src/world/queue.ts`) sits beside the Front Desk, with the same desk and the same role. It is its own world because a layout shares its world's actions: three new actions on the Front Desk would change that card's tool list, and so its golden trace.

**The queue.** Six visitors wait, each with a note hidden until read:
- **`read-note`** (observe) reveals a visitor's note. The note carries a **reading**: *on the list* or *not*, and how sure, by the one confidence formula.
- **`let-in`** and **`turn-away`** act on a visitor whose note has been read.

**The line.** The world reads the child's line from `config.knobs.threshold`. A reading below it goes to a colleague instead (`escalated`), with a line that says so (*"Only 55% sure — below your line of 65%"*). The colleague can take three.

**The readings are fixed, not drawn.** A lesson that moved under the child's feet would teach nothing.

| Visitor | Reading | Sure | Actually |
|---|---|---|---|
| Ada Quill | on the list | 95% | on |
| Ben Hollis | not on the list | 90% | not |
| Cara Voss | on the list | 80% | on |
| Dev Marsh | on the list | 55% | **not** |
| Esme Lund | not on the list | 40% | **on** |
| Finn Oakes | on the list | 70% | on |

**Winning.** `queue-handled` holds when:
- everyone has been dealt with;
- nobody was let in who was not on the list, and nobody turned away who was;
- no more than three were handed over.

**What the line does to a bot that does what the reader says:**
- **Below 60%**, Dev Marsh's 55% reading is acted on and he gets in: a loss.
- **From 60% to 80%**, both wrong readings go to the colleague, with two or three handed over: a win.
- **Above 80%**, four or more are handed over and the colleague is swamped: a loss.

**The default is 50%, so the card starts on a loss, on purpose.**

**The card.** `workshop/sure-or-unsure` is for the Kit (no `audience`). It has par 12, teaches `confidence` and `humans-in-the-loop`, and has hints for both ways to lose.

**The dial.** A deliberate `core` seam (hard rule 4):
- **`GoalCardDefinition.dial?`** is `{ knob, label, min, max, step, default, format?, lowLabel?, highLabel? }`. The schema refuses a default outside the dial.
- **`AgentSpecV2.goalDial?`** is the player's setting, saved with the bot.
- **`worldConfigFor(card, setting)`** clamps and snaps the setting and hands it to `create` as `config.knobs[knob]`. The session, the group and a fork all use it, so all three build the same world.
- **`run.started.goalDial?: { knob, value }`** puts the value in force on the trace (`02-…` §7).

A card with no dial is unchanged, and every golden run with it.

**The chip.** A desk record may carry `reading?: { question, answer, confidence }` (`core/types/desk-world.ts`). The Kit's case file draws it as the question, the answer and a chip saying *55% sure*. It is world state, like any field; nothing reads it as truth.

**The Kit.**
- **The bench.** When a card has a dial, the card holder shows it: a range input with its label and both ends, reading *50%*. `aria-valuetext` carries the same words.
- **The Demo Brain** plays the bot that does exactly what the reader says (`lib/demo-brain.ts`), so the run is won or lost by the line alone.
- **The L3 solvability plan** (`packs/workshop/src/session/plans.ts`) is the other bot. It decides by what was actually so, doubts the 55% reading, and wins at the default line, because every card must have a scripted solution inside the default budget.

## 4. Part I

`docs/manual/USER-MANUAL.md`'s Part I becomes *The bank made fallible, and the Gate*. §59 (the Gate) is kept, and six sections are added:
- §60 readers and the confidence gate;
- §61 corpora;
- §62 the register, regenerated (the fallible tier and the reviewer model);
- §63 the benchmark and the injection defences;
- §64 the reading desk;
- §65 *Sure or unsure*.

It also adds the Contents, Appendix A's two routes, Appendix B's schemas, and Appendix D's figures 28–30:
- `ws-benchmarks.png`;
- `ws-readings.png`;
- `kit-sure-or-unsure.png`, which is new.

The PDF is rebuilt with `docs/manual/pdf/` (`prep.py`, `build.py`, `render.py`) from the win32 baselines.

## 5. The budgets

- **The totals:** +20 kB in every edition. That covers the five roundels, the queue world and its words, the dial and the chip.
- **The Kit's first page:** its gate rises by 10 kB. The Workshop pack rides on the first page, and the card is the Kit's own content.

## 6. Stage note (2026-09-30)

Built as §2–§5 describe. The tests:
- **The world:** `packs/workshop/src/world/queue.test.ts`. The same obedient bot loses at 50%, wins at every line from 60% to 80%, and loses at 90% with the colleague swamped. Acting before reading is refused, and `checkDesk` passes.
- **The pack:** its conformance suite has a desk fixture for the queue, and its solvability suite has the plan at par 12.
- **The seam:** `core/src/session/world-config.test.ts` covers clamping, snapping, the default and the schema's refusal, and the value reaching `create` and `run.started` in a session and a group.
- **The Kit:** `e2e/sure-or-unsure.spec.ts` builds, dials, starts and plays by keyboard alone, losing at 50% and winning at 65%.
- **The figure:** `e2e/visual.spec.ts` takes `kit-sure-or-unsure.png`.

**Divergences:**
- **The count:** 29 files, not 27 (§2).
- **Its own world:** the card runs on a world of its own beside the Front Desk, not on a layout of it (§3).
- **The Linux baselines** for the new and moved shots come from CI's `visual` artefact on the first push, as for WP122–WP130.
