# Craft A Bot — UX findings and functionality gaps

> A walk of the running build, from a user's chair. Written 2026-09-07 against `main` at `38f346d` (WP0–WP73 shipped), driving the production build served at `localhost:4173` in Chrome at 1568 × 744, with an OpenAI key and a Supabase workspace token fitted, a Cloud Armour token present but stale, and no Azure key.
>
> Companion to `USER-MANUAL.md`. The manual says what the product does; this says what got in the way.

---

## 1. How this was done, and how to read it

**What I did.** Opened the shelf, the bench and a run; ran a desk card end to end; ran the shipped 640-cell injection baseline in the browser and read its report; opened a stored desk run in the Run Lab and inspected the trace; walked the Playground and all four desks; walked Guards, Evidence, Assurance, Telemetry, Evaluators, Scenarios and Settings; and read the source where the screen alone could not tell me whether something was a defect or a decision.

**What I did not do.** Test on a small viewport, a phone or a touch device. Test with a screen reader (the product has an automated accessibility pass and keyboard coverage in its own suite; I did not add to it). Run a live campaign, a live counterpart, a hosted evaluator or an evidence push, all of which need credentials that are absent or stale. Time anything with instruments — the performance notes below are what a user would notice, not measurements.

**One thing I nearly reported and did not.** The Run Lab rendered once at about 40 % scale in the corner of the viewport. It did not reproduce on a fresh navigation to the same URL, and it followed two capture timeouts, so it is an artefact of the automation, not the product. Mentioned only so nobody chases it.

**Severity.** *High* — the product tells the user something untrue, or an enterprise reader would lose confidence. *Medium* — real friction, or a job that takes longer than it should. *Low* — polish.

**Effort.** *S* — an afternoon. *M* — a few days. *L* — a work package.

---

## 2. Summary

| # | Finding | Severity | Effort |
|---|---|---|---|
| **UX-1** | A guard that *could not run* is reported as a guard that *did its job* | **High** | S |
| **UX-2** | The Cloud Armour battery reads "Charged" for a token the guard has already rejected | **High** | S |
| **UX-3** | The principal is a raw browser id in the Run Lab and in the filed assurance pack | **High** | S |
| **UX-4** | The evidence-store battery uses the provider-battery copy, and it reads as nonsense | Medium | S |
| **UX-5** | The four Playground campaigns cannot be loaded from the Campaigns screen | Medium | S |
| **UX-6** | Content width is inconsistent: half the Workshop is empty on a wide screen | Medium | M |
| **UX-7** | Boundary-map labels collide with the ring and with each other | Medium | M |
| **UX-8** | The desk's three panes are unreadably narrow inside the Run Lab | Medium | M |
| **UX-9** | The only way into a run from the Run Browser is the bot's name | Medium | S |
| **UX-10** | 57 goal cards in one horizontal scroller, ungrouped and unsearchable | Medium | M |
| **UX-11** | A desk card is a conversation, but Hearing is off by default | Medium | S |
| **UX-12** | Running a campaign locks the tab, with no cancel and no time remaining | Medium | M |
| **UX-13** | The campaign report renders every gate, cell and 200 cases at once | Medium | M |
| **UX-14** | Setting up the evidence store is two halves in two places with no checklist | Medium | S |
| **UX-15** | Abandoned runs stay `IN_PROGRESS` for ever and skew every dashboard | Medium | S |
| **UX-16** | Internal document references leak into user-facing and reviewer-facing copy | Medium | S |
| **UX-17** | The desk run screen still calls itself the Playroom | Low | S |
| **UX-18** | Heading style is inconsistent across the Workshop | Low | S |
| **UX-19** | The About panel says the licence is undecided; the repository says Apache-2.0 | Low | S |
| **UX-20** | The Assurance screen is blank until a bot is chosen | Low | S |
| **UX-21** | Two bots with the same name are indistinguishable in every picker | Low | S |
| **UX-22** | Every desk page says "the four decks" and then lists five | Low | S |
| **GAP-1** | Control-map rows can never stop being `unreviewed` from inside the product | Medium | M |
| **GAP-2** | Nothing prompts a first-time user through the Playground | Medium | M |
| **GAP-3** | No cohort or parity view outside a campaign report | Medium | M |
| **GAP-4** | The evidence store is configured by hand-typed JSON | Medium | S |
| **GAP-5** | A desk cannot be driven conversationally without a second seat or Hearing | Medium | M |
| **GAP-6** | No comparison of two campaign reports | Medium | M |
| **GAP-7** | The README describes a product two phases out of date | Medium | S |
| **GAP-8** | `docs/playground.md` under-counts the desks' contents | Low | S |

---

## 3. Findings that affect trust in what the product says

These come first because this product's whole proposition is that what it tells you is true.

### UX-1 — A guard that could not run is reported as a guard that did its job · **High** · S

**What I saw.** I fitted the Advice Desk card *Sell the fund* on a bot carrying the Armour Brick, and pressed STEP. The run ended immediately. The end card said:

> 🛡 **The Safety Brick did its job**
> *A rule you set stopped the run before it went further. That is the system working, not failing.*

and the header chip read **Safety brick: 2 checks, 1 save**.

The trace says something else. In the Run Lab, the `guardrail.tripped` event reads:

```json
{
  "guardrailId": "geap/armor:observation",
  "hook": "pre-think",
  "reason": "the guard could not check — the battery token was rejected",
  "disposition": "stop-run"
}
```

Nothing about the customer's request was unsafe. Model Armor's token was rejected, the guard failed closed — correctly — and the run stopped before the model was ever called (0 tokens).

**Why it matters.** The product told me the opposite of what happened. For a learner, chapter 6's lesson is inverted: they see a guardrail "catch" something when no rule fired on any content. For a demonstration to a bank, an expired token silently becomes a story about a working control, which is the one kind of mistake this product cannot afford. And *"1 save"* counts an outage as a save, which quietly pollutes the guardrail-saves readout on the Bench dashboard.

**Fix.** The engine already knows the difference — the disposition came from a failure branch, and the reason says so. Carry that distinction to the surface:

- A second end card: *"The safety check could not run"* — "The Armour Brick could not reach its service, so it stopped the run rather than let it continue unchecked. That is fail-closed. Nothing was wrong with what the customer said." With a link to the battery.
- Count fail-closed stops separately from rule catches in the chip and in *guardrail saves*.
- Say the same thing in the Kit's story strip.

**Where.** The end-card copy and the safety tally in `apps/workbench/src/lib/` (`end-card-hint.ts`, `safety-tally.ts`); the reason already exists on the event.

---

### UX-2 — The battery meter says "Charged" for a token the guard has already rejected · **High** · S

**What I saw.** Immediately after the run above, **Settings → Cloud Armour battery** showed a full meter and the word **Charged**, with the note *"A token was found from an earlier session — its own remaining life is unknown until you re-insert."*

So: the guard rejected the token seconds ago; Settings says the battery is charged; and the small print admits the app does not actually know. Three different answers on one screen.

**Why it matters.** This is the screen a user goes to *because* something failed. It sends them away again.

**Fix.** When a credential is rejected at run time, record it against the vault entry and show it: **Rejected — sign in again**, with the time it happened. The honest note about unknown life is good; pair it with what the last real call actually returned. (The Guard Rack's **Test the guard** does make a real call — its result should feed the same state.)

**Where.** The vault (`state/keys.ts`, `state/geap-credential.svelte.ts`) and the battery compartments.

---

### UX-3 — The principal is a raw browser id, in the evidence · **High** · S

**What I saw.** The Run Lab header chip: **started by 18706923-4c6c-4e06-b4c1-2cbc413838d7**. The assurance pack, section 2 (Governance):

> Principal: person (18706923-4c6c-4e06-b4c1-2cbc413838d7) (runs: 7c117fbf-…, f9a3b3ce-…)

The field that fixes this exists — **Settings → Workshop → Your name, on the trace** — and is blank, which is the default. Nothing anywhere asks for it. The visual-regression baseline for the Run Lab shows *"started by Sam"*, so the design intends a name.

**Why it matters.** Section 2 of the assurance pack is the SS1/23 governance section — *who ran this, on whose authority*. A UUID is the least useful possible answer, and it is the one a reviewer will receive by default. UX-3 is cheap to fix and disproportionately damaging left alone.

**Fix.** Ask once, at the point of value rather than in a settings list: a one-line prompt on the Assurance screen (*"This pack will record you as `18706923…`. Add a name?"*) and on first Workshop entry. Fall back to something human — the machine's name, "This browser" — rather than a bare id.

**Where.** `state/preferences.svelte.ts`, the Assurance route, the Run Lab header chip.

---

### UX-4 — The evidence-store battery reads as nonsense · Medium · S

**What I saw.** **Settings → Supabase evidence store — Workspace token battery** carries the generic provider-battery copy, with the credential's display name substituted into it:

> *"It goes to **Supabase evidence store — Workspace token** and nowhere else. Craft A Bot has no server. Your key is sent straight from this page to the **Supabase evidence store — Workspace token** API, **with your own account footing the bill**."*
> *"Use a spending-capped key. Make a separate key just for this and give it a budget — **manage your Supabase evidence store — Workspace token keys**."* (a link)

The workspace token is not a metered provider key, nobody is footing a bill per call, and the link goes nowhere useful.

**Why it matters.** It is the first thing a team sees when setting up shared evidence, and it reads like a bug — which it is.

**Fix.** Give the compartment a `kind` (`provider` / `service`) and two copy templates. The provider text is good; the service text needs three sentences and no billing claim.

**Where.** `components/settings/BatteryCompartment.svelte`.

---

## 4. Layout and information design

### UX-6 — Half the Workshop is empty on a wide screen · Medium · M

**What I saw.** At 1568 px wide, the **Bench dashboard** and the **Campaigns** screen render inside roughly 670 px, leaving ~800 px of empty ground to the right. **Runs**, **Playground** and the desk pages use the full width. There is no consistent rule.

It matters most on Campaigns, where the constrained column holds a JSON editor about six lines tall and a report whose gate table has seven columns — so gate names wrap to three lines and the `where` clause wraps to two, in a column half the available width, next to nothing.

**Why it matters.** These are the screens a practitioner spends hours on, and the layout is fighting them for space.

**Fix.** One measure rule for the Workshop: prose columns capped for readability (~75 characters), instruments and tables allowed the full width. Given the Control Room now has a component set, this is a container decision applied once rather than per screen.

---

### UX-7 — Boundary-map labels collide · Medium · M

**What I saw.** On the Playground's bank map, nine service-line nodes fan around a circle; several labels overlap each other and the words `local` underneath them, and `SERVICE-LINE · THE CRM` overlaps `SERVICE-LINE · CORE BANKING`. On a desk map, `DESK · THE ADVICE DESK (SYNTHETIC BANK)` is drawn straight through the ring and collides with `EGRESS DECLARED · 2 HOSTS`.

The numbered legend beneath is doing the real work; the picture is decoration in the worst case and misreading in the best.

**Why it matters.** The boundary map is the product's answer to "show me the system" — the picture an executive audience looks at. It has to be clean at the sizes people actually use.

**Fix.** Collision-aware placement (push labels to a radius that clears the ring; drop to leader lines when crowded), a minimum arc between nodes, and truncation with a tooltip past a character count. If nine nodes cannot be labelled legibly, group by kind and expand on hover.

---

### UX-8 — The desk panes are unreadably narrow in the Run Lab · Medium · M

**What I saw.** Opening a desk run, the Desk sits in a box about 470 px wide inside a 1568 px viewport, split three ways. The **CASE FILE** column is ~100 px, so the desk brief wraps to one or two words per line for twenty lines. The right 60 % of the page is empty.

**Why it matters.** The case file is what a reviewer reads to judge whether the bot had what it needed. In this form they will not read it.

**Fix.** Let the desk take the available width; give the three panes a sensible ratio (transcript wide, case file medium, queue narrow) with the case file collapsible; wrap long field values rather than the labels.

---

### UX-13 — The campaign report renders everything at once · Medium · M

**What I saw.** After the 640-cell baseline finished, the page holds 13 gate rows, 32 cell rows and 200 case rows. Interaction becomes noticeably heavy — a screenshot capture timed out twice at 30 s around this point, and the page recovered a few seconds later. The cases table is truncated at 200 with the note *"the rest are in the report's JSON"* and no way to page.

**Why it matters.** The cases table is where a fraud reviewer goes to find the case that went wrong. Truncation without paging means the answer may simply not be on screen, and the honest note points them at a JSON file.

**Fix.** Virtualise or paginate the cases table, and give it the filters the Run Browser already has (outcome, guard, brain, seed range, cohort). Sort by "most interesting" — failures first — rather than by cell order.

---

## 5. Discoverability and flow

### UX-9 — The only way into a run is the bot's name · Medium · S

**What I saw.** In the Run Browser I clicked the row and the start time of the run I wanted; nothing happened. Searching the page for a link into the run returned exactly one: the bot's name in the **BOT** column.

**Why it matters.** The column labelled *bot* is the link to the *run*, and the rest of a 9-column row is inert. It is a small thing that every user hits on their first visit.

**Fix.** Make the row clickable (or the started-time cell the primary link), keep the bot name as a link to the Spec Lab, and show a row hover state.

---

### UX-10 — 57 goal cards in one scroller · Medium · M

**What I saw.** With the Playground installed and the Workshop door open, the bench's card rack holds **fifty-eight cards** — starter, Workshop world, and every desk card from four desks — in one horizontally scrolling strip, with no grouping, no filter and no search. To reach *The clear approve* you scroll past fifty-two others.

**Why it matters.** The rack was designed for a dozen cards. This is the moment the Playground makes the Kit worse, and it will get worse again with a fifth desk.

**Fix.** Group the rack by pack or world with sticky headings ("Playroom", "The Advice Desk", "The Fraud Desk"…), and add a filter box. The data is there — every card already carries its world and its pack.

---

### UX-11 — A conversation desk with hearing switched off · Medium · S

**What I saw.** On the Advice Desk run screen, **Say something to your bot** is disabled: *"This bot has no ears… Your bot has the Eyes & Ears brick, but its hearing is switched off. Turn Hearing on in the brick's panel and it will listen while it works."*

The message is clear and correct. But the desk *is* a conversation — the transcript is the world — and the default leaves the customer unable to speak.

**Why it matters.** A first-time Playground user fits a desk card, presses GO and cannot talk to the bot; the fix is two clicks away in a brick panel they have no reason to open.

**Fix.** When the fitted card's world is a desk, either default Hearing on, or put the switch in the disabled field's own message as a button ("Turn hearing on"). The build checks on the bench could also say it before the run starts.

---

### UX-14 — The evidence store is two halves in two places · Medium · S

**What I saw.** The Evidence screen shows **✓ Workspace token fitted** with an **Eject** button, and — at the foot of the same page — *"No store is configured. Everything else works exactly as before; save a store above to push and pull."* The **CONFIG (JSON)** box above says **Will call: nowhere**.

So the token is in and the store is not configured, and the two facts are 400 px apart with the negative one last.

**Why it matters.** It is a two-step setup presented as two unrelated widgets, and the "you are not done" message is the easiest thing on the page to miss.

**Fix.** A short checklist at the top: *1 — paste the store's URL, key and workspace · 2 — fit the workspace token · 3 — test the connection.* Each with a tick. The "Will call" line is a good instrument; put it beside step 1.

---

### UX-15 — Abandoned runs never resolve · Medium · S

**What I saw.** 40 stored runs, of which **30 are `IN_PROGRESS`** — runs left part-way, some of them weeks old. The Bench dashboard corroborates it in its own words: *success rate 20 % of **10 finished** (40 total)*. Those thirty count in Telemetry's *By goal card*, in the fleet table's *last outcome*, and in every count an assurance pack makes. There is no bulk tidy, and the only filter is by outcome.

**Why it matters.** Every headline number in the Workshop is wrong in the same direction, and a reviewer reading an assurance pack has no way to know why.

**Fix.** Reconcile on load: a run whose session is gone becomes `ABANDONED` (a new outcome, or `STOPPED_BY_USER` with a reason). Exclude it from rates, count it separately, and offer *"tidy 26 abandoned runs"* on the Run Browser.

---

### UX-16 — Internal references leak into reviewer-facing copy · Medium · S

**What I saw.** Scenario tags shown to the user include `19/#25`, `19/#12`, `19/#38` — references to a design document's control catalogue. The assurance pack, section 4, reads:

> *"Who validated this build is not recorded in this build (WP65)."*

and evaluator descriptions in the Workshop cite `14-…` and `reasonsUsed`.

**Why it matters.** `19/#25` means nothing to a conduct reviewer, and a work-package number in a filed governance artefact reads as a leaked internal note. The obligation tags beside them are excellent; these are the ones that undercut them.

**Fix.** Give the internal tags a display gloss (`19/#25` → *policy-compliance under pressure*) with the raw id in a tooltip, and strip WP references from anything the assurance pack renders.

---

### UX-17, UX-18, UX-19, UX-20, UX-21 — polish · Low · S each

- **UX-17.** The desk run screen's page title is *"Playroom — My Very First Agent"*. It is a desk, not the Playroom. (`routes/play/[agentId]`.)
- **UX-18.** Workshop headings mix registers: `RUNS`, `GUARDS`, `TELEMETRY`, `CAMPAIGNS` in engraved caps, but *Assurance pack*, *Safety case*, *Policy Studio*, *Audit centre* in sentence case, and the rail mixes *Test Bench* with *Safety case*. Pick one and apply it.
- **UX-19.** Settings → About says *"Licence to be confirmed before release"*; `LICENSE` and the README both say Apache-2.0.
- **UX-20.** The Assurance screen is an empty page with one dropdown until a bot is chosen. Default to the most recently run bot, as the Evaluators screen defaults to the most recent run.
- **UX-21.** Two bots are both called *My Very First Agent*, and every picker (Assurance, Campaigns' build adder, Guards' *Fit into*, Evaluators) lists them identically with no way to tell them apart. Show the last-run date or the first six characters of the id beside the name.
- **UX-22.** All three desk pages announce **"The four decks"** above a table that lists five — the operational-incident deck was added after the heading was written. Advice, Fraud and Lending are all affected, and `docs/playground.md` has the same drift (GAP-8). Derive the count from the data.

---

## 6. Performance in the browser

### UX-12 — A campaign run locks the tab · Medium · M

**What I saw.** **Run campaign** on the 640-cell shipped baseline: the button becomes a live counter (*Running 176/640…* → *537/640…*), which is good. It completed in roughly 45–60 seconds. During that time the tab could not service a screenshot capture within 30 seconds, twice — the main thread is saturated between yields. There is no **Cancel**, no elapsed or remaining time, and no indication that the page will be unresponsive.

**Why it matters.** A user who starts a campaign and then tries to look at something else finds the whole tab wedged, with no way out but reload — which loses the run. And 640 cells is the *small* case; the Playground baselines are larger, and the first thing anyone will do is add seeds.

**Fix, in order of value:**
1. A **Cancel** button, and a stored partial report.
2. Elapsed and estimated remaining beside the counter, and a warning that the page will be busy.
3. Move the run into a Worker. The design of record judged one unnecessary because the macrotask yield kept the baseline responsive enough; the evidence here is that at 640 cells it does not. This is the L-sized option and the right one if campaigns in the browser are to grow.

---

## 7. The Playground specifically

### UX-5 — The Playground's campaigns cannot be loaded from the screen · Medium · S

**What I saw.** The Campaigns screen has one **Load baseline** button, wired to the injection baseline. The four campaigns that matter to a financial-services user — `fs-advice-baseline.json`, `fs-fraud-baseline.json`, `fs-lending-baseline.json`, `fs-complaints-baseline.json` — ship in `campaigns/` in the repository and can only be loaded through **Import…** from a file on disk. In a *published* section there is no such file to import: a visitor to `/playground` cannot run the Playground's own campaigns at all.

**Why it matters.** This is the shortest path from "I am a conduct reviewer" to "I can see the evidence", and it is closed in the deployed product. Everything needed is already bundled — the campaigns are built by code that ships.

**Fix.** Turn **Load baseline** into a picker over every campaign the installed packs ship, defaulting to the section's most relevant one (the Advice Desk in `/playground`). Add a **Run this desk's campaign** button on each desk page, where the user already is.

---

### GAP-2 — Nothing walks a first-time user through the Playground · Medium · M

**What I saw.** The Kit has ten chapters and six side quests. The Playground has four excellent reference pages and no path. A conduct reviewer landing on `/workshop/playground` gets a case generator, a boundary map and nine service lines, with no answer to "what do I do first?"

**Why it matters.** The Playground's audience is the least likely to explore and the most likely to want a defensible sequence. §34 of the manual had to invent that sequence; the product should carry it.

**Fix.** A short guided path per desk, in the leaflet's own idiom but for adults: *see the scenario → see the control → run the campaign → break it and watch the gate fail → open the case → fork it → file the pack.* Six steps, each a link into the screen that does it.

---

### GAP-3 — No cohort or parity view outside a campaign report · Medium · M

**What I saw.** Cohorts are in truth, the parity gate reads them, and the campaign report slices by them. Nothing else does: Telemetry has no cohort axis, the Run Browser cannot filter by cohort, and there is no way to ask "how did this bot decide across age bands last week" without running a campaign.

**Why it matters.** Fairness is the question the Lending Desk exists to make askable, and it can only be asked inside one artefact.

**Fix.** A cohort axis on Telemetry over stored runs' truth, and a cohort filter in the Run Browser. Both read a field that is already stored.

---

## 8. Gaps that are features, not defects

### GAP-1 — Control-map rows can never be reviewed from inside the product · Medium · M

All 52 rows in the assurance pack are `unreviewed`, and the pack's header counts them. That is the correct default. But the only way for a row to become reviewed is to edit the pack's source and rebuild — so in the deployed product the count can never change, and every pack a firm files says *52 unreviewed*.

**Fix.** A review action per row in the authored-content store: who accepted it, when, and an optional note; rendered in the pack; exportable and pullable through the evidence store. It is the same content mechanism that already exists for policy and assertion cards.

### GAP-4 — Evidence-store configuration is hand-typed JSON · Medium · S

`{"url": "…", "anonKey": "…", "workspace": "…"}` typed into a textarea, with mistakes discovered on the first push. Three labelled fields and a **Test connection** button would remove the whole class of problem. (`docs/evidence-setup.md` is good; the screen should not need it.)

### GAP-5 — A desk cannot be driven conversationally without ceremony · Medium · M

To have a conversation with a desk today: fit the card, remember to turn Hearing on, press GO, then type each customer line yourself; or run Robot Friends with a live visitor; or use the harness. There is no *"be the customer"* mode on the desk page itself — which is the single most compelling demonstration the Playground can give.

**Fix.** A **Talk to this desk** button on each desk page: fits a default bot, seats you as the counterpart, opens the transcript.

### GAP-6 — No way to compare two campaign reports · Medium · M

Runs can be compared side by side; campaign reports cannot. The `no-regression` gate compares against a committed baseline in CI, but in the browser, with several stored reports listed, there is no "what changed between these two?" — which is exactly the question after changing a guard stack.

### GAP-7 — The README describes a product two phases out of date · Medium · S

`README.md` still points readers at `docs/design/` (superseded, and `CLAUDE.md` says not to read it), still says "V1.0 is feature-complete except for artwork", quotes 314 kB of JavaScript, and never mentions the Workshop, the Playground, the harness, campaigns, the assurance pack, the evidence store or the three published sections. Its command table omits fifteen of the scripts that now exist.

For a repository that is heading for public release under Axiom Verity's name, the README is the shop window.

### GAP-8 — `docs/playground.md` under-counts the desks · Low · S

It says the Advice Desk has "Sixteen cards, thirty scenarios"; the application says seventeen and thirty-one. Fraud and Lending are out by one similarly. The operational-incident deck (WP72) added a card and a scenario to each and the prose was not updated.

---

## 9. What I would do first

**This week — the trust fixes, all small.**
1. **UX-1** — separate "could not check" from "caught something", in the end card, the story strip and the saves count.
2. **UX-2** — record a rejected credential against the vault entry and show it in the battery.
3. **UX-3** — ask for a name before the first assurance pack, and never render a bare UUID as a principal.
4. **UX-4** — a second copy template for service credentials.
5. **UX-19**, **UX-17** — the licence line and the page title.

**Next — the Playground's own path.**
6. **UX-5** — a baseline picker, and *Run this desk's campaign* on each desk page.
7. **UX-11** — Hearing on for desk cards.
8. **UX-10** — group and filter the card rack.
9. **GAP-2** — the six-step guided path per desk.

**Then — the instrument work.**
10. **UX-6**, **UX-8** — one measure rule; give the desk its width.
11. **UX-7** — collision-aware boundary labels.
12. **UX-12**, **UX-13** — cancel, progress, and a virtualised cases table; a Worker if campaigns are to grow.
13. **UX-15** — reconcile abandoned runs.

**Then — the enterprise gaps.**
14. **GAP-1** — control-row review as content.
15. **GAP-3**, **GAP-6** — cohorts outside a campaign; report comparison.
16. **GAP-7** — rewrite the README.

---

## 10. What is genuinely good, and should not be traded away

Worth recording, because a list of complaints is a misleading picture of this build.

- **The honesty.** *"Spend and 30-day trends are not shown: there is no cost model in the repo and no thirty days of history. A dashboard that invented either would be worse than one that says so."* *"No drift flagged"*, with the thresholds stated. *"Coming soon"* on the one expansion pack whose content does not exist. This voice is rare and it is the product's biggest asset with a regulated audience — UX-1 is jarring precisely because it is out of character.
- **The trace.** Every claim on screen is traceable to a typed event, and the inspector shows the event. The `guardrail.tripped` payload told me exactly what had gone wrong in one line of plain English.
- **The desks' content.** The scenarios are recognisably the real thing — the coached APP-scam customer, the caller who threatens a complaint, the support need used to skip an affordability check, the poisoned factsheet. Someone who knows the domain wrote these.
- **The campaign report.** Gates, cells, cases and four export formats, from a file that CI runs unchanged. That is the product's proof and it works.
- **The assurance pack.** Eight sections, 52 mapped rows, a digest, and a self-contained HTML file a reviewer can open with nothing installed. With UX-3 fixed it is ready to send.
- **The simulation notice**, on every desk view and every filed artefact. Keep it.
