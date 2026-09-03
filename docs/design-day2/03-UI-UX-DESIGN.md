> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward as the V1.0 baseline. Superseded in part by `15-UIUX-DUAL-MODE.md` (dual-mode architecture), `16-TEACHING-AID-UIUX-IMPROVEMENTS.md` (prioritised improvements) and `17-PRO-MODE-UI-DESIGN.md` (professional toolkit).
> This file is a verbatim copy of `docs/design/03-UI-UX-DESIGN.md` carried into the standalone Day 2 set; only this banner has been added.

# 03 — UI / UX Design

> Screens, interactions, drag-and-drop behaviour, and the run experience for "My Very First Agent".
> Prerequisite reading: `00-PROJECT-OVERVIEW.md`, `02-AGENT-MODEL.md`. Visual styling lives in `04-VISUAL-DESIGN-LANGUAGE.md`.

---

## 1. Experience pillars

1. **It feels like opening a toy box, not launching an IDE.** Every screen is themed as physical kit material: the box, the parts tray, the baseplate, the instruction leaflet, the play mat.
2. **Direct manipulation first.** Bricks are dragged, snapped, popped off, and flipped over. Config lives on the brick you click, not in a distant settings page.
3. **Two modes, one mental model:** **BUILD** (the workbench) and **PLAY** (the Playroom + trace). A big physical mode switch flips between them; the bot you built visibly *is* the bot in the playroom.
4. **Nothing is hidden, nothing is scary.** Every playful surface has a flip side showing the real thing (real prompt, real JSON, real terminology) — one click away, never forced on the user.

## 2. Application map

```
┌ Shelf (home) ──────────────────────────────────────────────┐
│  Your kits/agents as toy boxes · “New bot” · Import kit     │
│  Expansion packs shelf (Multi-Pack teaser) · Settings       │
└─────────┬──────────────────────────────────────────────────┘
          ▼
┌ Workbench (BUILD) ────────────┐   ┌ Playroom (PLAY) ────────────┐
│ Parts tray │ Baseplate │ Brick │◀─▶│ World view │ Bot head-up    │
│ (left)     │ (centre)  │ panel │   │ (centre)   │ + controls     │
│ Goal Card rack (bottom)       │   │ Trace drawer (bottom/right)  │
└───────────────────────────────┘   └──────────────────────────────┘
          ▲                                       ▲
          └── Instruction Leaflet (tutorial overlay, both modes) ──┘
Settings: battery compartment (API keys) · preferences · about
```

## 3. The Shelf (home screen)

- Agents displayed as **toy boxes on a wooden shelf**, each with generated box art (bot name, brick colour-strip showing which bricks it has, "contents" list). Hover tilts the box slightly.
- Actions per box: Open (→ Workbench), Play (→ Playroom, if valid), Duplicate, Export kit file, Bin.
- **"New bot"** = a shrink-wrapped box that "opens" with a short unboxing animation into an empty baseplate + full parts tray.
- **Expansion shelf**: the LLM Multi-Pack (and future packs) shown as boxes "still in the shop" — greyed with a price-tag-style "coming soon" sticker in V1. Establishes the merchandising fiction early.
- First-run: the shelf holds one item — the "My Very First Agent" box, with a pulsing "Open me!" sticker → launches the tutorial.

## 4. The Workbench (BUILD mode)

Three-column layout:

### 4.1 Parts tray (left)

- A moulded plastic tray (like real kit inner trays) with one well per brick type: LLM, Memory, Tools, Sense, Actions, Safety. Below them, smaller wells: model cartridges, goal cards.
- Each well shows the brick's sprite, name, and a stock state: available / already fitted (empty well with a shadow outline) / needs-something (e.g. LLM brick shows "no battery" tag if no API key is configured).
- Hover = brick lifts slightly + one-line whisper of what it does. A small **"?"** flips the tray card to the "what this really is" side.

> **Amended 2026-09-03:** with a dozen kinds across the installed packs the single-column tray grew past the bottom of the page, and a well below the fold could not be dragged from. The tray is now a compact two-across grid that sticks to the top of the viewport (`position: sticky`, its own scroll only if a very small window forces it), so every well is on screen wherever the page has scrolled. Beside the drag, **a double-click on a well fits the brick straight into its socket** — the same fit, cue, panel and announcement a drop makes — and the tray says so under the wells. Enter still lifts a brick for the keyboard; the drag is kept, as the nicest way to do it.

### 4.2 Baseplate (centre)

- The bot chassis outline with **shaped sockets**: head socket (LLM), backpack (Memory), belt (Tools), visor (Sense), feet/wheels (Actions), chest (Safety), plus the **card holder** slot for the Goal Card. Sockets are shaped/coloured to match their brick — the classic "the piece only fits where it belongs" affordance.
- The assembled bot is drawn as a coherent toy robot — bricks visually *become* body parts, matching the box art robot.
- **Build checks** ribbon: friendly validation from `validateSpec` ("Needs a brain!", "Sums card works best with the calculator tool") with a jump-to-fix on click. GO stays disabled until the spec validates.
- Big **GO lever** bottom-right of the bench → switches to PLAY.

### 4.3 Brick panel (right)

- Clicking a fitted brick opens its panel, styled as the brick enlarged, with physical controls: **dials** (temperature), **sliders** (memory span), **toggles** (tool/action/sense switches shaped like vintage rocker switches), a **cartridge slot** (LLM), and the **flip button** → real-terminology side with the actual config values, the tool JSON schemas, and a short "in real systems…" paragraph.
- Panel changes apply live to the `AgentSpec` (with undo).

### 4.4 Drag-and-drop rules

- **Pointer-based custom DnD** (see `05-TECH-STACK.md` §5): pick up with click-hold or touch, brick follows pointer with a slight tilt and drop shadow.
- **Snap:** when over a compatible socket, the socket highlights and the brick "magnetises"; release = *clunk* (audio optional, off by default) + a 150ms settle animation. Incompatible sockets shake their head (2° wobble) and the brick returns to tray with a spring animation on release.
- **Remove:** drag a fitted brick off the baseplate → it returns to its tray well. If removal invalidates something (e.g. removing Memory while notebook tools are on), the build-checks ribbon explains, never blocks.
- **Keyboard path (required, not optional):** Tab to tray, Enter to "pick up", arrow keys move focus between sockets, Enter to place, Esc to cancel. Every DnD interaction has a keyboard equivalent; screen-reader announcements for pick-up/target/placement (see §8).

### 4.5 Goal Card rack

- A card rack along the bench's bottom edge holding the starter Goal Cards; the active card sits in the baseplate's card holder. Cards show title + tiny scene thumbnail; click to read full card (goal text, "you'll probably need" brick hints, difficulty pips).
- "Free play" card has a writable text area (the laminated card with a marker pen).

## 5. The Playroom (PLAY mode)

### 5.1 Layout

- **Centre:** the world view — the 8×6 playroom rendered as a warm flat-illustrated scene (rug, toy chest, shelf, table, Teddy, items, and the user's bot). One action per tick animates legibly (bot slides one cell, item hops into its hands, speech bubbles for `say`).
- **Top bar ("head-up"):** the bot's face (from its build), goal text, tick counter vs budget ("steps left" as a battery/fuel gauge), token meter, status lamp (thinking = pulsing amber, acting = green, paused = blue, tripped = red).
- **Controls (bottom):** **STEP** (one tick), **PLAY/PAUSE** with speed dial (0.5×–4×), **STOP**, **RESET WORLD**. In the tutorial, STEP is the hero button.
- **Thought bubble:** the bot's current thought (from `decision`) appears as a comic-style bubble over its head, abbreviated; click to expand full text.

### 5.2 The trace drawer

- A drawer along the bottom (desktop: optionally docked right) labelled **"Flight Recorder"**, always available, opens without pausing the run.
- **Timeline view:** one row per event, colour-coded by brick (sense rows light blue, think rows blue, tool rows purple, action rows red, memory rows green, guardrail rows yellow/black). Ticks are grouped; the current tick auto-follows unless the user has scrolled (then a "jump to now" chip appears).
- **Row expansion:** any row expands to the full payload; `prompt.composed` shows the **exact messages sent** with sections labelled (system / memory / observation) and a token count; `think.completed` shows raw response + usage; `action.performed` shows the world's narration + state diff.
- **Approval interrupts** (Safety Brick approval mode): the run pauses, the proposed action appears as a card in the world view — *"Snackbot wants to `open(toy_chest)` — Allow / Deny"* — and as a highlighted trace row. Deny feeds a polite refusal back into the next observation.
- **End cards:** each `run.finished` reason gets a full-screen card in kit style — SUCCESS = confetti + "GOAL ACHIEVED!" rosette; OUT_OF_STEPS = the bot sitting down with "Ran out of steps — what would help it plan better?"; STOPPED_BY_GUARDRAIL = the safety brick proudly saluting. Every card has "See the flight recorder" and "Back to the bench".
- **Export trace** button → JSON download (see `07-DATA-MODEL-PERSISTENCE.md` §5).

> **Amended 2026-08-12 (WP6):** a selected row's payload opens in a **detail pane below the list** rather than expanding the row inline. Inline expansion means variable row heights inside a virtualised list, which makes scrolling markedly more fragile at the 10,000-event target in `01-ARCHITECTURE.md` §8 — and a 2,000-line composed prompt is unreadable squeezed into a row anyway. Same information, same one click, sturdier scrolling.
>
> Also from WP6: the engine now emits a `world.changed` immediately after `run.started`, so the opening scene has an event behind it. Without it the world view would have to read the engine's world object directly, which hard rule 3 forbids — and a trace would not contain the state the run began from.

## 6. Instruction Leaflet (onboarding/tutorial)

- Styled as the fold-out paper instructions from a real kit: numbered steps, exploded diagrams, minimal words, that slightly yellowed paper texture.
- Runs as an overlay that **points at the real UI** (arrow stickers + dimmed background) rather than screenshots; the user performs each step themselves.
- Follows the teaching arc in `02-AGENT-MODEL.md` §9 (six chapters). Each chapter ends with a collectible **merit badge** sticker on the leaflet's back page (pure delight, no gamification systems beyond this).
- Skippable at any point ("I've built kits before") and re-openable from a drawer handle labelled "Instructions" in both modes.

> **Amended 2026-08-16 (WP25):** the back page also lists **side quests** — optional goal-card scenarios named and one-lined, no anchor, no badge — under the merit badges. "No gamification systems beyond this" held: a side quest earns nothing and tracks nothing, it is a reference the reader can act on later, the same register as the chapter's own hint text.
- Chapter 1 script (for flavour): *"1. Snap the LLM brick into the head socket. 2. Pop in a battery (your API key) — grown-ups: see the battery compartment. 3. Slot in the 'Say Hello!' card. 4. Pull the GO lever. Uh oh — your bot can think but it can't DO anything! 5. Add the Actions brick and try again…"*

## 7. Settings

- **Battery compartment** (the star): rendered as a toy battery bay with a screw-flap animation. One battery slot per provider (V1: OpenAI). Paste key → battery slides in, meter shows "charged" after a validation ping. Plain-English safety copy: where the key lives (this browser only), where it's sent (api.openai.com only), how to remove it. Remove = battery ejects.
- Preferences: sound on/off, animation reduced (respects `prefers-reduced-motion`), tick speed default, theme (V1: single retro theme).

> **Amended 2026-08-12 (WP9):** the **sound switch is deferred to WP10**, which is when motion and sound actually arrive. The `sound` preference exists in the settings schema and is stored, but no control is shown for it: nothing in V1 makes a noise, and a switch that controls nothing misrepresents what the product does. Reduced motion and tick-speed default ship now and are wired for real — the former as a `data-reduced-motion` attribute on the document element, honoured alongside `prefers-reduced-motion`; the latter as the Playroom's starting speed, which the in-run dial still overrides.
- About: credits, licence, "built in public" link.

## 8. Accessibility (requirements, not aspirations)

- Full keyboard operation of build and play (see 4.4; STEP/PLAY/STOP are plain buttons).
- All meaning carried by colour is doubled by shape/label (bricks have distinct silhouettes + embossed names; trace rows have icons + labels).
- Contrast: AA minimum for text on the retro palette — the palette in `04-VISUAL-DESIGN-LANGUAGE.md` defines compliant text/background pairings.
- Screen reader: live-region announcements per tick phase ("Tick 4: Snackbot sees a snack to the north"); the trace is a proper table/list semantically.
- `prefers-reduced-motion`: snap/settle animations become instant state changes; the world view swaps slides for fades.
- Copy readability: friendly but not babyish; UK English; every toy term paired with its real term at first mention per session.

## 9. Empty/error/edge states (kit-flavoured, specified now so they're never afterthoughts)

| State | Treatment |
|---|---|
| No API key when GO pulled | "Batteries not included! Pop your OpenAI key into the battery compartment." → deep-link. |
| Provider 401/429/5xx | Battery meter flashes; plain-language explanation + retry; raw error one click away. |
| Malformed LLM output (no parseable call) | Trace row "The bot mumbled" with raw text; engine re-prompts once with a stricter instruction, then counts a wasted tick. Teaching moment about output reliability. |
| Import of invalid/newer kit file | "This kit is from a newer set!" + schema version details. |
| Missing pack content (kit references uninstalled pack) | "This bot uses parts from the {pack} expansion" + list of missing part IDs. |
| Storage full / IndexedDB unavailable | Warn, offer trace export, run continues in memory. |

> **Amended 2026-08-12 (WP9):** "The bot mumbled" is derived in the UI from the `decision` event itself — one carrying neither a call nor any thought text — rather than from a new event type. The data is already on the record, so hard rule 3 holds and the trace format is unchanged.

## 10. Layout & responsiveness

- **Desktop-first** (1280×800 reference). Bench three-column collapses to two below 1100px (tray becomes a drawer). PLAY: world view keeps a 4:3 area; trace drawer becomes full-width bottom sheet below 1100px.
- Tablet landscape must be fully usable (pointer events already cover touch). Phone: view-only politeness screen in V1 ("Craft A Bot needs a bigger table — try it on a laptop").
