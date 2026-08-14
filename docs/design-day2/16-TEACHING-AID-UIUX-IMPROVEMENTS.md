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

> **Amended 2026-08-14 (WP16 slice c):** the card holder now shows it — "About **N** steps", with the expert card's warning beside it. The `expert` flag on the card is what drives that warning, not a threshold computed from `par`: a pack may ship a long card it considers ordinary, and guessing would take the decision from the author. One consequence, found only by looking at it: the expert warning was **also** `hints[0]` on `starter/locked-chest-expert`, put there by WP11 because the holder had nowhere to say it, so the card announced itself twice — once beside its par and once as "You'll probably need: Expert card…". That hint is now removed; hints are for what is in the room.

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
>
> **`mode` is no longer part of this slice's scope.** The problem statement's "`mode` recorded wrongly" was fixed by WP13's E8: `toRunRecord` derives it from `run.started` rather than hard-coding `'step'`, so a run played straight through is no longer filed as a stepped one. What remains here is (a) incremental persistence, (b) the Scrapbook, and (d) the leave-mid-run confirm.

> **Amended 2026-08-14 (WP16 slice e):** built — (a), (b) and (c).
>
> **The premise was wrong, and worth recording.** `12-…` D14 says "runs + events fully persist... but nothing lists, reopens or replays them", so this was scoped as a missing *page*. It was a missing *write*: `putRun` was being handed reactive `$state` proxies and IndexedDB rejected every one with "could not be cloned". The write was the last thing a finished run did, its rejection surfaced only as an unhandled promise, and no test had ever looked in the `runs` store. **No run had ever been stored.** Writing records earlier is what exposed it; records are snapshotted now.
>
> **Replay is not a second implementation.** `absorb`'s fold moved out of `session.svelte.ts` into `lib/state/run-projection.ts`, and the replay viewer is `projectThrough(events, tick)` plus the same `WorldView` and `StoryStrip` the Playroom uses. "Pixel-consistent with a live run" is therefore not a property that was tested into existence but one that holds because there is only one reducer; the suite pins the ways it could drift apart again (folding all at once equals folding one at a time; scrubbing to turn N lands where the run passed through). The scrubber re-folds from the start rather than undoing events — an inverse for every case would be the second implementation all over again.
>
> **Persistence flushes per turn, not per batch.** The recorder batched at 25 events, and a tick emits well under that, so a child who shut the tab two turns in had a stored run with an empty story — most of what this section exists to prevent. A turn is also the unit the Scrapbook and the story strip deal in, so a partial trace never ends mid-thought.
>
> **The in-progress record is kept current.** Written once at `run.started` it said "0 steps" forever, so an interrupted run sat in the Scrapbook claiming it never moved.
>
> **Still outstanding: (d), the leave-mid-run confirm.** It is no longer the safety net it was designed as — the run is now saved as it happens, so leaving loses nothing — and it should be re-judged on its own merits rather than inherited from a problem that has gone away.

### 1.5 Navigation, confirmations, and safe destruction

**Problem:** Settings unreachable from Shelf; Bin deletes a bot with one tap; eviction silent (D16/D15).
**Design:** persistent kit-styled header (Shelf · Scrapbook · Instructions · Settings); Bin asks "Take {name} apart? Its adventures stay in the scrapbook" with export nudge; eviction shows the friendly notice the storage layer already returns.
**Accept:** e2e for nav from every route; delete requires confirm; eviction notice spec.

> **Amended 2026-08-14 (WP16 slice c):** built. The header is `lib/components/kit/NavHeader.svelte`, mounted in the layout beside the leaflet — Settings is now reachable from every screen, closing D16's first half. **Instructions is a button, not a link:** the leaflet is an overlay the layout owns because its chapters span the bench and the Playroom, so navigating to it would lose the reader's place. **Scrapbook is deliberately not in the header yet** — `/scrapbook/[agentId]` arrives with slice e, and a dimmed button that does nothing is a worse promise to a five-year-old than a header that gains an item. A test pins that absence and should be deleted when slice e lands.
>
> The Bin now asks, in `TakeApartConfirm.svelte`, with the export nudge. Cancel takes focus and Escape cancels: the safe answer is the one you get by flinching.
>
> **A correction to the design above.** "the friendly notice the storage layer already returns" was not true — `evictOldRuns` returns the evicted **ids** (`Promise<string[]>`), and its own comment says they exist "so the UI can show the friendly notice". The notice had to be written, not surfaced; it is `lib/eviction-notice.ts`, a pure function so the copy can be tested, and the play route had been discarding the return value entirely.

### 1.6 An honest speed dial and lively status

**Problem:** mid-run speed changes are a silent no-op (D15).
**Design:** apply speed live to the session loop delay; persist the dial back to preferences; lamp words stay, plus the bot's face reflects state (thinking/confused/celebrating) using the `#face-slot` expressions.
**Accept:** e2e: change speed mid-play → measured tick cadence changes.

> **Amended 2026-08-14 (WP16 slice d):** built.
>
> **The dial needed a core change**, which is worth recording because the design above reads as though it were UI work. `tickDelayMs` was captured when the session was built, so nothing the workbench could do would reach a run in progress — the only honest options were a new seam or rebuilding the session and losing the trace. `AgentSession.setTickDelayMs` is that seam (`02-…` §6). It is **not** traced: the gap between ticks changes no decision, no world state and no outcome, so it is not engine behaviour under hard rule 3, and putting a viewing preference into an audit record would be worse than leaving it out. The dial also now writes back to preferences, so the speed a child can follow survives the run they found it on.
>
> **A correction to the design above.** "the `#face-slot` expressions" reads as though the mechanism exists; it does not. `#face-slot` is commissioned art (`11-…` §5, wave M1) and WP18 draws it. What that manifest *does* settle is the division of labour — art supplies the layers, code drives them from session status — so slice d builds the code half: `lib/bot-expression.ts` maps run state to one of the six commissioned expressions and drives the placeholder glyph the Playroom already draws the bot with. When the art lands it is a rendering swap, not a rethink.
>
> The face is not a second status lamp. The lamp says what the machine is doing; the face says how it is going, and they part company exactly where it matters — the lamp reads `finished` whether the bot won or ran out of steps, and has nothing to say about an action the world has just refused. `confused` is the face §1.2 asked for and slice b could not yet draw.

## 2. P1 — The substantial-improvement wave

### 2.1 Safety centre stage

**Problem:** the Safety brick is visually central but experientially peripheral: its trips are quiet trace rows plus an end card; approval is the only loud moment.
**Design:** make governance _visible working_: the chest brick glows amber whenever a check runs and flashes green/red on verdicts ("SAFETY FIRST" stamp FX on blocks); a small **safety ticker** on the head-up bar counts checks/blocks this run ("Safety brick: 14 checks, 2 saves"); denied actions show the stamped card in-world; the end card for STOPPED_BY_GUARDRAIL stays celebratory. Approval card gains argument names (fix the values-only signature) and a "why am I being asked?" flip.
**Accept:** every `guardrail.checked/tripped` has a visible/audible beat; e2e asserts ticker counts match trace counts.

> **Amended 2026-08-14 (WP17 slice c):** the **safety ticker** is built and is the heart of this section. `lib/safety-tally.ts` counts from events — a denial emits `guardrail.tripped` alongside its `guardrail.checked`, so counting tripped events counts each denial exactly once — and the head-up bar reads "Safety brick: 14 checks, nothing to stop". The quiet success is the case worth showing: a run where the brick checked fourteen times and stopped nothing looked, before this, exactly like a run with no safety brick at all. It says nothing before the first check, because "0 checks, 0 saves" reads like a broken brick rather than an idle one.
>
> **The acceptance test is taken literally**, and reads the counts back out of **storage** rather than off the screen — the Flight Recorder virtualises its rows, so counting what is rendered counts the wrong thing, and storage is the more useful comparison anyway: an independent record of the same events the ticker claims to summarise.
>
> **The approval card** now names its arguments — `move(direction: north)`, not `move(north)`. `move(north)` read plausibly enough that nobody noticed the names were missing; `put_down(block_a, shelf)` does not, and a person cannot answer a question they cannot parse. It also gains a "Why am I being asked?" disclosure, because approval is the one place in the toy where a grown-up is asked to take responsibility.
>
> **Three things in this section are deliberately not built, and one is already done.**
>
> - The **chest brick glowing amber** assumes the bricks are on screen during play. They are not — the baseplate lives on the bench, and the Playroom has no brick display at all. Putting one there is a layout change this section does not ask for and `03-…` §5.1 does not describe. The ticker carries the "visible beat" requirement instead.
> - The **"SAFETY FIRST" stamp FX** and the **stamped card in-world** are art (`11-…` §9), and belong with WP18 like the confused face and the puff FX from §1.2.
> - The **end card for STOPPED_BY_GUARDRAIL** was already celebratory — "The Safety Brick did its job… That is the system working, not failing." No change needed, and none made.

### 2.2 Tutorial gap-fixes (evidence: leaflet review)

Spotlight the _specific_ prompt row in chapter 2 (not the whole drawer); add a chapter or side-quest covering temperature/memory-span/notebook (the dials are never taught); fix the badge toast showing ids; add a trace-lane legend card to the Flight Recorder header; add a 5-minute "quick tour" alternative to the full arc.
**Accept:** leaflet e2e extended per change; every configurable control referenced by at least one chapter/side-quest.

> **Amended 2026-08-14 (WP17 slice e):** four of the five built; the quick tour deferred.
>
> **The acceptance criterion is now a test.** `coverage.test.ts` enumerates every field of every brick schema and holds each to being claimed by a chapter's `controls`. It is declared rather than inferred from the prose — a chapter that mentions "temperature" in passing has not taught it, and a test matching on words would be satisfied by the mention. A brick that grows a field fails there until somebody decides where it is taught, which is the same trick as WP12's dead-config audit and for the same reason: deciding is the point.
>
> **A seventh chapter, "Turning the dials"** (`02-…` §9 amended to match). Thirteen controls were configurable and none was claimed; the six brick chapters go from "fit the brick" straight to "run it", so the settings that most change how an agent behaves had no lesson. Mostly `ack` steps by necessity — `BotCapabilities` reports what a bot *can do*, not what it is *set to*, and inventing a way to watch numbers change would be a large seam for a small gain. The notebook is genuinely checked, because having one is a capability. Chapter 6 also gained two reading steps so its claims on the step budget, the loop-breaker and the blocklist are honest ones.
>
> **The prompt row is spotlit, not the drawer.** Chapter 2 asked the reader to "read the first prompt" while pointing at the whole Flight Recorder — a hundred rows, one of which was meant. The anchor scan in `anchors.test.ts` was taught to read a *conditional* anchor, since the row is only the first composed prompt.
>
> **The badge toast says the name** (`12-…` D16's last item): it read "Merit badge earned: **elephant-memory**", because the earned list holds ids and the name lives on the chapter. **A trace-lane legend** now sits in the Flight Recorder header — the rows have been colour-coded by brick since WP6 with nothing anywhere saying so, which is the difference between a code and a decoration.
>
> **Deferred: the five-minute quick tour.** It is a second authored path through the same material, and its content depends on which of the seven chapters a hurried adult most needs — a decision about audience rather than a gap in the code.
>
> One honest note on coverage. The browser walk proves the six brick chapters end to end and that the arc *reaches* chapter 7; chapter 7's own predicates are pinned by a unit walk in `chapters.test.ts`, alongside every other chapter's. Driving it through the browser too would have added a minute to the slowest test in the suite to re-prove what the unit walk already holds.

### 2.3 Celebration, identity, and delight

Render `boxArtSeed` (deterministic box art + bot face variation); success = confetti FX + Teddy-happy + fanfare (sound prompt on first success: "Want sound effects?"); merit-badge and approval and guardrail cue sites added to `sound.ts`; end cards gain a "what would help?" hint drawn from the trace (e.g. OUT_OF_STEPS + high loop score → "It kept trying the same thing — the Safety brick has a rule for that").
**Accept:** distinct box art per bot; hint text matches trace-derived cause in fixtures.

> **Amended 2026-08-14 (WP17 slice d):** three of the four built; two deliberately deferred.
>
> **`boxArtSeed` is rendered** (`lib/box-art.ts`, closing `12-…` D17). A deterministic sticker — colour, corner and a slight hand-applied tilt — because the seed's whole purpose is that a bot looks the same on every visit and an exported kit arrives elsewhere wearing the face it left with. Composition only: never the brick colours, silhouettes or type, which `11-…` §2 fixes as the brand. **Right-hand corners only** — the left of a lid is taken by the brick colour strip, and a sticker there covered the one part of the box that says what is in it.
>
> **The end card's "what would help?" hint** is `lib/end-card-hint.ts`, read from the run's own trace. OUT_OF_STEPS looks identical whether the budget was too small or the bot was going in circles, and those want opposite fixes — so the hint distinguishes looping, repeated refusals, never reaching for a tool, and simply running out of room. It stays **silent** where the trace does not support a diagnosis, and silent for SUCCESS, STOPPED_BY_USER and STOPPED_BY_GUARDRAIL: a tripped guardrail is the system working (`08-…` §3) and advice would frame it as a fault.
>
> **Three sound cues added** — `badge`, `ask`, `stopped` — with their sites. The `stopped` cue is deliberately not a buzzer: a child should not be made to feel told off by the thing that protected them.
>
> **Deferred, and worth a decision rather than an assumption.** The **confetti FX** and **Teddy-happy** are celebration art; Teddy-happy is squarely WP18 (`11-…` §9), and confetti is code but belongs with it so the success moment is designed once rather than twice. The **"Want sound effects?" prompt on first success** is a consent flow, and where it sits relative to the Settings toggle that already exists is a product decision this section does not settle.

### 2.4 Naming forgiveness in the world (C4's UI face)

When `resolveNamed` reports ambiguity/miss, the world's narration already lists candidates; the UI additionally shows tappable chips of the candidates ("Did it mean: block A · block B?") — for the _player's_ understanding (the bot still learns from text).
**Accept:** ambiguity narration renders chips; paraphrase corpus (13 §4.5) reduces miss rate.

> **Amended 2026-08-14 (WP17 slice d):** the chips are built, and needed a schema change to be honest.
>
> The world has always *said* the candidates, and prose is the right answer for the **bot** — it reads the narration and tries again, which is the behaviour this section is careful to preserve. It is the wrong answer for the **UI**, which would have had to parse English back into a list. `ActionResult.didYouMean` carries the names as data alongside the unchanged narration: **additive**, so every trace ever written still parses (`14-…` §7), and a world that does not populate it simply has nothing to offer.
>
> **The chips are buttons only when the bot can hear** (§2.6). §2.4 says they are for the player's understanding and that the bot still learns from the text, so nothing here is load-bearing for the run — but a chip that looks tappable and does nothing is a worse lie than a plain list. With ears, tapping says "I meant the block A" to the bot; without, they are words.
>
> The **paraphrase corpus** half of the acceptance belongs to the naming work in `13-…` §4.5 and is not touched here.

### 2.5 Free play made real

`customGoalText` reaches the prompt (E-fix); "Goal achieved!" button ends the run as SUCCESS via `declareOutcome` (E2); `celebrate` also ends free play (E12) — the bot can decide it's done, which is a lovely lesson in self-assessment vs external judgement (contrast shown on the end card).
**Accept:** e2e free-play run ends SUCCESS both ways; prompt contains the custom goal.

> **Amended 2026-08-14 (WP17 slice b):** built, and the "E-fix" was the whole of it. `customGoalText` had been captured, stored and displayed since WP5 and never once put in the prompt — a child who wrote their own goal had a bot that pursued the card's printed wording instead. `composeSystemMessage` now prefers the written goal; whitespace does not count as writing, and the card still supplies the trace record and the success condition.
>
> **E12 was already done**: `freePlayManual` returns `state.celebrated`, so `celebrate` has ended a free-play run since WP11. What was missing was the other half — a person's verdict — which is now the "Goal achieved!" button on `session.declareOutcome`. The end card says which of the two happened, because that contrast *is* the card's lesson: a bot judging its own work and a person judging it are different things, and both are SUCCESS.

### 2.6 Hearing that works

With E2's `deliverInput`: a chat bubble input on the play screen ("Say something to your bot") enabled when the Hearing channel is on; tutorial side-quest: redirect the bot mid-run by talking to it.
**Accept:** e2e: typed message appears in next observation; sense-off leaves input disabled with explanation.

> **Amended 2026-08-14 (WP17 slice b):** built as `SayToBot.svelte`. `deliverInput` existed from WP13's E2 and had no mouth; this is it, and it is the first control in the toy that changes a run while it is happening without stopping it.
>
> **Hearing is off by default** — the visor opens sight and compass — which the design above does not say and which matters, because the disabled state is the common one rather than the exception. The explanation therefore does the teaching, and it distinguishes **two** cases the design treats as one: a bot with no Eyes & Ears brick, and a bot that has the brick with its ears switched off. Only looking at it in the running app showed the difference — the copy was telling a child to fit a brick they had already fitted.
>
> The tutorial side-quest named here belongs to §2.2 and lands with slice e.

### 2.7 Play-route accessibility completion

Live region via the story strip (1.3); focus trap + initial focus on EndCard/ApprovalCard; keyboard shortcut for STEP (space) with a visible hint; touch-target audit ≥44px on play controls and trace rows.
**Accept:** axe pass on all routes; keyboard-only full run e2e.

> **Amended 2026-08-14 (WP17 slice a):** built, and the audit found far more than this section anticipated.
>
> **Focus traps** on the end card, the approval card and the take-apart confirm, via one `use:focusTrap` action (`lib/a11y/focus-trap.js`) — Tab cycles inside, focus returns where it came from on dismiss. The approval card focuses **Deny**: the run is stopped waiting for a person, so the answer you get by pressing Enter without reading should be the one that cannot do anything. Escape now belongs to the dialog rather than the window, which is why the take-apart confirm's Escape test fires at the card.
>
> **Space steps the run**, with a visible `space` hint on the button, ignored while typing (Free Play has a goal to type, and §2.6 will add a message to send).
>
> **Touch targets** on the play controls were about 32px and are now 44px (WCAG 2.5.5).
>
> **The axe pass was not a formality.** It failed **five of six routes**, all on `color-contrast`, from a single systemic cause: `opacity` used to make secondary text quieter, in 57 places. The fix is a design-language change recorded in `04-…` §2.3 — two contrast-checked muted tokens, and a rule against dimming text with opacity. The Instruction Leaflet was the worst offender at roughly 2:1.
>
> Worth noting for the rest of WP17: `contrast.test.ts` passed throughout, because the tokens were never wrong — the rendering was. The axe suite is now the guard that can see the difference, and it runs on every route in CI.

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
