# 16 — My Very First Agent: Prioritised UI/UX Improvements (Workstream 4)

> The concrete, prioritised improvement plan for the teaching aid. Each item: the problem (with evidence from the Day 2 code review), the design, and its acceptance test. Priorities: **P0** = do first, the experience is materially broken or misleading without it; **P1** = the substantial-improvement wave; **P2** = polish that can trail.
> Prerequisite reading: `12-CURRENT-STATE-ASSESSMENT.md` §2–3, `15-UIUX-DUAL-MODE.md`. Engine-side behaviour fixes (C1–C8) are specified in `14-…` §3 and are assumed to land alongside — several items below are their visible faces.

---

## 1. P0 — Make the core loop trustworthy and legible

### 1.1 Fix the unwinnable Goal Cards (C6)

**Problem:** Tidy the Blocks (~34 optimal turns) and Locked Chest (~45) cannot be won against the 30-tick floor — by any bot, ever. Non-tutorial players "trying to win" get OUT_OF_STEPS with no hint the card is at fault.
**Design:** re-scope the cards rather than raise the floor (the floor is a governance teaching point): Tidy → two blocks nearer the chest; Locked Chest → key moved inboard + chest pre-tidied variant ("open it and put one block away"). Add a **"par"** to every card (difficulty pips become "about N steps") and show it on the card holder. Keep one deliberately-hard card labelled as such ("Expert card — your bot will probably need a bigger step budget!") so the budget dial gets a reason to exist.
**Accept:** scripted-optimal solutions (13 §L3) pass within default budget for every non-expert card; card holder shows par; e2e run of each card to SUCCESS.

> **Amended 2026-08-13 (WP11):** the engine and content half is done — cards re-scoped, `par` on every winnable card, and the L3 suite (`packages/packs/starter/src/session/solvability.test.ts`) proving each one inside the default budget and asserting the plan is exactly as long as the par it advertises. The deliberately-hard card is a **seventh** card, `starter/locked-chest-expert`, preserving V1.0's layout rather than leaving one of the flagship two unwinnable; its measured par is 36. **Showing par on the card holder is still to do and belongs to this WP's UI wave (WP16)** — the data is there waiting for it.

### 1.2 Show the bot's failures where the player can see them (C2's UI face)

**Problem:** world refusals ("too far away", "locked") are invisible unless buried in memory prose; players watch the bot repeat mistakes and can't tell why — the single biggest "this toy is broken" impression.
**Design:** every failed action gets an immediate visual beat: the bot's confused face, a puff FX (`fx-question-puff`), and the narration line shown under the thought bubble _and_ spoken into the story strip (1.3). The "Right now" feedback promotion (E3) means the _bot_ also knows — the player and the bot learn from the same signal, which is itself the lesson.
**Accept:** e2e: a blocked/failed action shows narration within the same tick; eval harness shows repeated-identical-failure streaks drop vs baseline.

> **Amended 2026-08-13 (WP16 slice b):** the problem statement here was half stale by the time this WP started. A refused action already emits `action.performed` with `ok: false` and the world's own narration, and the thought bubble already showed it — WP11's E3 feedback promotion did that, and the refusal reaching the *bot* was always the harder half. What was genuinely missing was somewhere a player could see the failure **in the run's story rather than in one transient line**, which the story strip (§1.3) now is: a refusal is a distinct 😕 beat, in the world's own words, sitting in the turn where it happened and staying there as the run goes on. The confused face and the puff FX remain outstanding and belong with the art wave (WP18, `11-…` §9).

### 1.3 The story strip — per-tick narration for young learners

**Problem:** between STEP presses nothing explains _why_; the causal chain lives in the trace as JSON. Reading load is the ceiling for 5–8s.
**Design:** a horizontal strip under the world view showing the current tick as icon beats: 👀 saw → 💭 thought → 🔧/🚗 did → ✨/😕 result, each with a one-line child-voice caption derived from events (the narrated tick model, `15-…` §3). Tapping a beat expands it; optional **speech synthesis** reads the captions (Web Speech API, off by default, per-profile). Past ticks scroll left — the strip _is_ a child's trace, and clicking "see more" opens the Flight Recorder at that tick (the bridge to the real trace).
**Accept:** every tick renders 3–5 beats from events alone; screen-reader parity (the strip doubles as the play route's live region — fixes D16's missing announcer); usability check with a target-age reader.

> **Amended 2026-08-13 (WP16 slice b):** built. The narrated tick model is `lib/narration/narrate.ts` (slice a) and is derived from events alone, so the same function narrates a live run and a stored one — which is what §1.4's replay needs. The strip is the play route's live region and announces the turn as **one sentence** rather than beat by beat: a screen reader interrupting itself four times a turn is worse than a slightly longer sentence. Speech synthesis is in, off by default, with a Settings toggle.
>
> Two things only looking at it in the running app revealed, both now fixed and pinned by tests. The observation `summary` is written for the *memory window* — WP11 packed it with position and bearings so a bot could navigate from it — and it arrived on the strip as three semicolon-joined clauses truncated mid-word. The strip now takes the leading clause; the whole of it is one tap away in the Flight Recorder. And a truncated caption read "the she…." because an ellipsis was not counted as terminal punctuation.
>
> **The usability check with a target-age reader is outstanding** and cannot be done from here.

### 1.4 Run continuity: history, replay, and no lost runs

**Problem:** no run list/replay despite full persistence (D14); mid-run reload silently loses the run (D15); `mode` recorded wrongly.
**Design:** (a) wire `trace-recorder.ts` incremental persistence; (b) a **Scrapbook** page (`/scrapbook/[agentId]`): recent adventures as photo-card rows (outcome emoji, card title, steps used, date), pin = "keep this one", open = replay viewer with the existing WorldView + a scrubber and the story strip; (c) honest `mode`; (d) leave-mid-run confirm.
**Accept:** reload mid-run → run resumes as ended-in-progress with partial trace kept; storage-contract e2e; replay of a golden trace is pixel-consistent with live run.

> **Amended 2026-08-14 (WP16 status):** outstanding — this is **slice e**, the largest remaining piece of WP16 and the last of the five. It depends on slice b's story strip, which is built, and on slice a's constraint that narration derive from **events alone**: the same `lib/narration/narrate.ts` must drive a live run and a replayed one without the two disagreeing, which is exactly what the replay viewer needs. Per hard rule 3, the persistence/replay work needs its new observable behaviour added to the event catalogue in `02-…` §7 in the same PR.

### 1.5 Navigation, confirmations, and safe destruction

**Problem:** Settings unreachable from Shelf; Bin deletes a bot with one tap; eviction silent (D16/D15).
**Design:** persistent kit-styled header (Shelf · Scrapbook · Instructions · Settings); Bin asks "Take {name} apart? Its adventures stay in the scrapbook" with export nudge; eviction shows the friendly notice the storage layer already returns.
**Accept:** e2e for nav from every route; delete requires confirm; eviction notice spec.

> **Amended 2026-08-14 (WP16 status):** outstanding — this is **slice c**, and the next thing to pick up. It also carries the leftover from §1.1: **par on the card holder is display-only**, since WP11 landed the `par` data on every winnable card. The eviction notice is likewise display-only — the storage layer already returns the friendly message, it simply reaches no UI.

### 1.6 An honest speed dial and lively status

**Problem:** mid-run speed changes are a silent no-op (D15).
**Design:** apply speed live to the session loop delay; persist the dial back to preferences; lamp words stay, plus the bot's face reflects state (thinking/confused/celebrating) using the `#face-slot` expressions.
**Accept:** e2e: change speed mid-play → measured tick cadence changes.

> **Amended 2026-08-14 (WP16 status):** outstanding — this is **slice d**. Independent of slices c and e, so it can be taken in any order among them. The face half uses the `#face-slot` expression mechanism that already exists; the honest-dial half is the live fix for `12-…` D15's silent no-op.

## 2. P1 — The substantial-improvement wave

### 2.1 Safety centre stage

**Problem:** the Safety brick is visually central but experientially peripheral: its trips are quiet trace rows plus an end card; approval is the only loud moment.
**Design:** make governance _visible working_: the chest brick glows amber whenever a check runs and flashes green/red on verdicts ("SAFETY FIRST" stamp FX on blocks); a small **safety ticker** on the head-up bar counts checks/blocks this run ("Safety brick: 14 checks, 2 saves"); denied actions show the stamped card in-world; the end card for STOPPED_BY_GUARDRAIL stays celebratory. Approval card gains argument names (fix the values-only signature) and a "why am I being asked?" flip.
**Accept:** every `guardrail.checked/tripped` has a visible/audible beat; e2e asserts ticker counts match trace counts.

### 2.2 Tutorial gap-fixes (evidence: leaflet review)

Spotlight the _specific_ prompt row in chapter 2 (not the whole drawer); add a chapter or side-quest covering temperature/memory-span/notebook (the dials are never taught); fix the badge toast showing ids; add a trace-lane legend card to the Flight Recorder header; add a 5-minute "quick tour" alternative to the full arc.
**Accept:** leaflet e2e extended per change; every configurable control referenced by at least one chapter/side-quest.

### 2.3 Celebration, identity, and delight

Render `boxArtSeed` (deterministic box art + bot face variation); success = confetti FX + Teddy-happy + fanfare (sound prompt on first success: "Want sound effects?"); merit-badge and approval and guardrail cue sites added to `sound.ts`; end cards gain a "what would help?" hint drawn from the trace (e.g. OUT_OF_STEPS + high loop score → "It kept trying the same thing — the Safety brick has a rule for that").
**Accept:** distinct box art per bot; hint text matches trace-derived cause in fixtures.

### 2.4 Naming forgiveness in the world (C4's UI face)

When `resolveNamed` reports ambiguity/miss, the world's narration already lists candidates; the UI additionally shows tappable chips of the candidates ("Did it mean: block A · block B?") — for the _player's_ understanding (the bot still learns from text).
**Accept:** ambiguity narration renders chips; paraphrase corpus (13 §4.5) reduces miss rate.

### 2.5 Free play made real

`customGoalText` reaches the prompt (E-fix); "Goal achieved!" button ends the run as SUCCESS via `declareOutcome` (E2); `celebrate` also ends free play (E12) — the bot can decide it's done, which is a lovely lesson in self-assessment vs external judgement (contrast shown on the end card).
**Accept:** e2e free-play run ends SUCCESS both ways; prompt contains the custom goal.

### 2.6 Hearing that works

With E2's `deliverInput`: a chat bubble input on the play screen ("Say something to your bot") enabled when the Hearing channel is on; tutorial side-quest: redirect the bot mid-run by talking to it.
**Accept:** e2e: typed message appears in next observation; sense-off leaves input disabled with explanation.

### 2.7 Play-route accessibility completion

Live region via the story strip (1.3); focus trap + initial focus on EndCard/ApprovalCard; keyboard shortcut for STEP (space) with a visible hint; touch-target audit ≥44px on play controls and trace rows.
**Accept:** axe pass on all routes; keyboard-only full run e2e.

## 3. P2 — Polish that can trail

- **Art integration** per `11-VISUAL-ASSET-MANIFEST.md` waves (the single biggest perceived-quality jump; scheduled Phase B in `18-…`).
- Sound design pass beyond the four cues; optional per-bot voice blips.
- Tablet/touch e2e + sub-1100px layout tuning; the phone politeness screen artwork.
- Shelf richness: box 3/4 view, wear-and-tear on much-used bots, "trade" framing for export/import.
- Quarantine/storage health surfacing and "Forget everything" in settings (D17).
- Localisation-readiness audit of the strings modules (structure exists; keep it honest).

## 4. Measures of success

1. **Reliability of the flagship demo:** snack-goal success rate with Memory fitted (Quick Thinker, 20 seeds) ≥ 70% in the nightly eval; zero unwinnable non-expert cards.
2. **Legibility:** a first-time child user (with adult) can answer "why did it stop?" for all five outcomes using only the end card + story strip — tested in moderated sessions.
3. **Governance visibility:** users can point at the safety brick working (ticker/stamps) — the purpose-2 story is _shown_ in the toy.
4. **No silent lies:** every control does what it says (speed, dials on fixed-temperature cartridges, badge names) — the trust audit in 13 §L0 extended to UI copy.
