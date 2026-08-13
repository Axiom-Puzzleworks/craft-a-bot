> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward. The artwork remains owed; `18-DAY2-ROADMAP.md` schedules its production (Phase B).
> This file is a verbatim copy of `docs/design/11-VISUAL-ASSET-MANIFEST.md` carried into the standalone Day 2 set; only this banner has been added.

# 11 — Visual Artefact Manifest & Production Design Guide (V1.0)

> The complete inventory of every visual artefact V1.0 needs, and the production rules that make them feel like **large, dimensional, textured parts of a real toy** while remaining **configurable** exactly as far as V1.0 requires.
> Prerequisite reading: `04-VISUAL-DESIGN-LANGUAGE.md` (tokens, typography, accessibility — this doc builds on it and supersedes its §9 sketch). Interactions the assets must serve: `03-UI-UX-DESIGN.md`.
> This document is the working brief for the visual workstream. Treat it as the contract: if an asset needs something not specified here, amend this doc — don't improvise silently.

---

# PART I — DESIGN GUIDE

## 1. The three material families

Every artefact belongs to exactly one material family. The families have different finish rules, and keeping them distinct is what makes the whole feel like a real boxed kit — plastic parts sitting on printed card.

| Family | What it covers | Finish rules |
|---|---|---|
| **M1 · Moulded Plastic** | Bricks, cartridges, batteries, bot body, controls (buttons, dials, rockers, sliders, levers, meters), trays, socket surrounds, icons-as-mouldings | Smooth: specular + AO per §4. **Never** paper grain, never edge wear, never halftone. Crisp silhouettes — these are the interactive parts and must read instantly. |
| **M2 · Printed Card** | Panels, Goal Cards, agent boxes, leaflet, badges/rosettes, tabs, end-card frames, shelf backboard | Paper grain (≤5% opacity), halftone on large fills, edge wear (sparingly), print misregistration on decorative headings only. |
| **M3 · Painted Scene** | Playroom backdrop, scene items, Teddy, card thumbnails, end-card vignettes | Warm storybook flat-painting like the box art: soft edges, gouache-style shading, no outlines heavier than 2px. Items *in* the scene that the bot manipulates get a gentle M1 plastic read so they pop against the painted room. |

## 2. Scale system — "large" is a rule, not a vibe

- **Base unit:** `1 U = 96 px` at 100 % zoom (one stud pitch). All M1 parts are authored on a **24 px sub-grid** (¼ U).
- **Minimum on-screen sizes (hard rules):** bricks never render below 2 U (192 px) wide on the bench and 1.5 U in the tray; controls never below 0.5 U (48 px) in either dimension — which also satisfies touch-target accessibility; scene items never below 0.75 U.
- **Author at 1×, scale in CSS.** One master per asset; no separate "small" redraws (exception: favicons).
- **Chunk factor:** corner radii ≥ 12 px on M1 parts; stroke/detail lines ≥ 2 px; no detail smaller than 6 px — if a detail needs to be smaller to fit, the part is too small or too busy.

### 2.1 Canonical part footprints (M1)

| Part | Footprint (W × H) | Notes |
|---|---|---|
| LLM brick | 3 U × 2 U + 0.5 U antenna | Head-block silhouette |
| Memory brick | 2 U × 2 U | Satchel/backpack with flap |
| Tools brick | 3 U × 1.5 U | Belt with hanging tool loops |
| Sense brick | 3 U × 1 U | Visor strip with lens bumps |
| Actions brick | 4 U × 1.5 U | Wheeled base, wheels overhang 0.25 U |
| Safety brick | 2 U × 2 U | Chevron-striped shield block |
| Model cartridge | 1.5 U × 2 U | Grip ridges + gold pins (Multi-Pack box style) |
| Battery | 1 U × 1.75 U | Classic cylinder-in-frame read |
| Studs | 0.5 U ⌀, 0.15 U high | Ellipse cap, highlight arc top-left |
| GO lever | 2 U × 3 U | The single largest control on the bench |
| Push button | 1.5 U × 0.75 U (primary) / 1 U × 0.5 U (secondary) | |
| Rotary dial | 1.25 U ⌀ | |
| Goal Card | 2.5 U × 3.5 U | Portrait, laminated card |

## 3. Light, colour, and the one sun

- **One global light source: top-left, 45°.** Every highlight, every shadow, every AO pass obeys it. No exceptions, no per-asset creativity here — this is what makes separately-produced parts sit in the same world.
- Colours **only** from the `--cab-*` tokens (`04` §2). Shading is achieved by the layer recipes below, never by inventing darker/lighter hexes.
- Contact shadows are warm (`--cab-shadow`, #00000026) and short: parts sit *on* surfaces; nothing floats.

## 4. The dimension recipe (M1 — how "chunky plastic" is actually built)

Every M1 part is built from exactly these layers, bottom to top. Values are the defaults; deviate only for stated cause.

1. **Contact AO** — black 15 %, 8 px blur, offset +4 px y. Sits under the part.
2. **Side/depth face** — the part's tint darkened via a neutral multiply layer at 22 %; visible depth sliver of 0.25 U on the bottom and right edges (straight-on elevation with cheated depth — **not isometric**; the box art is frontal).
3. **Base fill** — flat token colour. On parametric templates this layer's fill is `var(--part-tint, <default token>)` (§6).
4. **Top-face lighten** — neutral screen/overlay layer, +12 % L equivalent, on the upper face and stud caps.
5. **Specular sweep** — soft white gradient, 35 % → 0 % opacity, entering from top-left, covering ≤ 30 % of the face.
6. **Emboss details** — moulded lettering and icons: letterpress treatment, 1 px dark inset edge (top) + 1 px light relief edge (bottom). Embossed text uses Archivo SemiBold caps.
7. **Part lines** — 2 px moulding seams at 12 % black where two plastic pieces meet (e.g. wheel hub, cartridge ridge).

Because layers 1, 2, 4, 5, 6, 7 are **neutral greys with blend modes**, re-tinting layer 3 re-lights the whole part correctly. This is the entire trick that makes templates reusable (§6) — shading must never be baked into the hue.

## 5. Texture recipes (M2 / M3)

- **Paper grain:** tileable 512 px noise, 3–5 % opacity, multiply. On every M2 surface; never behind text at > 5 %.
- **Halftone:** 512 px dot tile, dot pitch 6 px, 4–6 % opacity, only on M2 colour fills larger than 200 px.
- **Edge wear:** four corner/edge decals, applied max twice per screen, never on anything interactive, never overlapping text.
- **Misregistration:** ±1 px plate offset on M2 decorative headings only (pre-baked into the asset, not runtime).
- **M3 painting:** flat gouache shapes, 2-tone shading per object (base + one shadow tone from the token's text-variant), soft 10 % vignette at scene corners, rug texture as sparse woven dashes.

## 6. Parametric layer convention — how "configurable" works

Configurability in V1.0 is delivered by **authoring structure, not by more files**. Assets are SVGs with named groups; the app controls them with CSS custom properties and layer visibility. The manifest marks each asset with its parameter set.

**Named-group contract (SVG):**

```
#tint        fills reference var(--part-tint, <default>)   — recolourable base (layer 3)
#shade       neutral shading stack (layers 1,2,4,5,7)      — never recoloured
#emboss      moulded label text — swappable per instance
#icon-slot   empty <g> at a fixed origin — category icon mounts here
#state-*     optional hidden layers (e.g. #state-ghost, #state-open, #state-locked)
#face-slot   (bot/cartridges) — expression/decal mounts here
```

**Runtime parameters V1.0 actually uses (the "as far as we want" line):**

| Parameter | Applies to | V1.0 use |
|---|---|---|
| `--part-tint` | Brick template, cartridge template, status lamp, badge template | Fixed to the canonical mapping in V1 UI (colour↔concept is law, `04` §2.2) — but the capability ships now so expansion packs recolour templates without new art |
| Label text (`#emboss`, card titles, box name plates) | Bricks, cartridges, Goal Cards, agent boxes | Live text rendered by the app in matching type, not baked into art — supports free-play cards, bot naming, future localisation |
| State layers (`#state-*`) | Chest (closed/open/locked), battery (charge), compartment flap, lever, mode switch, rocker | Toggled by app state |
| `#face-slot` swap | Bot (6 expressions), cartridges (3 decals) | Driven by session status |
| Value-driven geometry | Meters (segment count/fill), dial rotation, slider position, stats dots | Rendered by code over art chrome; art supplies the housing only |
| Composition seeds | Agent box art (colour strip, sticker layout from `boxArtSeed`) | Deterministic assembly from template + parts list |

**Explicitly *not* configurable in V1.0:** brick colours in the shipped UI, silhouettes, typography, light direction, texture opacities. These are the brand.

**Art vs code responsibility (so nothing is drawn twice):**

| Behaviour | Owner |
|---|---|
| Drag lift/tilt/shadow, snap settle, invalid wobble, press-down on buttons | **Code** (transforms on the static asset) |
| Socket highlight/reject glow, focus rings, hover lift | **Code** (CSS on `#state-highlight` hooks or box-shadow) |
| Open/closed/locked, charge level, expressions | **Art** (state layers), toggled by code |
| Confetti motion, antenna pulse, cell-hop squash | **Code** animates static particle/pose assets |

## 7. File formats, naming, delivery

- **Vector first:** optimised SVG (SVGO, 2 dp precision), target ≤ 30 KB per part, ≤ 80 KB for scenes. Raster only for M3 painted backdrops and textures: WebP + PNG fallback, @1× and @2×.
- **Naming:** `assets/{category}/{name}[--{variant}][@2x].{ext}` — kebab-case, variants for baked states only (`toy-chest--locked.svg`).
- **Editable sources** (Figma/Affinity/AI files) live in `assets-src/` (not shipped, in-repo or linked drive — decide in the workstream kickoff).
- **Delivery flow per category:** placeholder (already in app, from WP5) → draft PR with asset(s) + this doc's checklist filled in → review against §8 → merge → app swap-in.

## 8. Per-asset definition of done (review checklist)

1. Correct material family recipe applied; one-sun rule obeyed.
2. **Silhouette test:** part recognisable as flat black at 64 px.
3. **Tint test** (parametric templates): render at 3 different `--part-tint` values — shading still looks physical.
4. Named-group contract present and correctly structured; label/icon slots at documented origins.
5. Tokens only (automated check: no out-of-palette hex in the SVG).
6. AA contrast for any in-asset text against its actual background.
7. Size budget met; SVGO-clean; renders identically in Chrome/Firefox/Safari.
8. Filed under correct name/category; manifest row ticked.

---

# PART II — THE MANIFEST

Priorities: **P0** = needed for the first real-art swap (WP5–8 placeholders replaced) · **P1** = needed for the V1.0 release (WP9–10) · **P2** = nice-to-have, can trail the release.
"Params" lists the §6 parameters each asset must support. Counts are individual deliverable files (excluding @2x fallbacks).

## A. Brand & identity — 8 files

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `brand/logo-horizontal` | CRAFT A BOT lockup as on the boxes: rounded caps, blue/green/red per-word inks, cream keyline + offset shadow. On-cream and on-blue variants in one file (state layers) | M2 | state: on-cream/on-blue | P1 |
| `brand/logo-stacked` | Square-ish lockup for small spaces | M2 | — | P1 |
| `brand/logo-mono` | Single-ink (`--cab-ink`) for print/embossing contexts | M2 | tint | P2 |
| `brand/subbrand-mvfa` | "My very first Agent" yellow rounded panel, warm serif, as the box | M2 | — | P1 |
| `brand/tagline-strip` | "BUILD · CONNECT · GIVE IT A GOAL · WATCH IT ACT" yellow-on-blue strip, 9-patch stretchable | M2 | — | P1 |
| `brand/app-icon` | Bot head on cream roundel; 16/32/180/192/512 exports from one master | M1 | — | P1 |
| `brand/og-card` | 1200×630 social card: box art crop + logo | M3 | — | P2 |
| `brand/wordmark-vertical` | Side-of-box vertical wordmark (shelf spines) | M2 | — | P2 |

## B. Bricks & sockets — 19 files

The six brick masters are **the** hero assets. Each is one parametric SVG (per §6) used at every size: tray, bench, fitted-on-bot, and panel backdrop (panel = same asset ≥ 2× with controls overlaid by the app). Footprints per §2.1; silhouettes per `04` §7.

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `bricks/brick-llm` | Head block, antenna, two lens-friendly stud rows, embossed "LLM"; cartridge slot aperture on the face (`#icon-slot` doubles as slot mouth) | M1 | tint, emboss, icon-slot, state-ghost | P0 |
| `bricks/brick-memory` | Satchel with flap; embossed "MEMORY" | M1 | same | P0 |
| `bricks/brick-tools` | Belt block, 3 hanging loop nubs; embossed "TOOLS" | M1 | same | P0 |
| `bricks/brick-sense` | Visor strip, 3 lens bumps; embossed "SENSE" | M1 | same | P0 |
| `bricks/brick-actions` | Wheeled base, 2 yellow wheels (`--cab-yellow` fixed, not tinted); embossed "ACTIONS" | M1 | same | P0 |
| `bricks/brick-safety` | Shield block, yellow/black chevron band; embossed "SAFETY" | M1 | emboss, state-ghost (tint locked) | P0 |
| `bricks/brick-template` | Blank generic brick for future packs: pure §6 contract demo, documented origins | M1 | full set | P1 |
| `bricks/socket-set` | Six shaped socket negatives (recessed silhouette + darker floor + stud holes), one file per type (`socket-llm` … `socket-safety`); includes `#state-highlight` rim layer for code to light | M1 | state-highlight | P0 |
| `bricks/icon-brain` `icon-memory` `icon-tools` `icon-sense` `icon-actions` `icon-safety` | Moulded white category icons (mount in `#icon-slot`): brain-circuit, scrapbook, crossed spanner, eye, forward arrow, shield-check. 24 px grid, ≥ 2 px strokes | M1 | — | P0 |

*(6 bricks + 1 template + 6 socket files + 6 icons = 19 files.)*

## C. Cartridges, batteries & power — 7 files

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `cartridges/cartridge-template` | The Multi-Pack cartridge: grip ridges, gold pin connector, label plate, `#face-slot` for decal, stats-dot zone (dots drawn by code) | M1 | tint, label, face-slot | P0 |
| `cartridges/decal-quick-thinker` | Cheery quick face decal (lightning whisker motif) | M1 | — | P0 |
| `cartridges/decal-deep-thinker` | Thoughtful face decal (furrowed brow, stars) | M1 | — | P0 |
| `cartridges/decal-penny-thinker` | Tiny gormless-but-lovable face decal (penny motif) | M1 | — | P0 |
| `power/battery` | Battery in carrier frame; charge states as layers: charged (full contact gleam) / low (amber ring) / flat (grey, tipped) | M1 | state-charge ×3 | P0 |
| `power/battery-compartment` | Battery bay panel: door with moulded screw, open/closed states; interior contacts visible when open | M1 | state-open | P0 |
| `power/screw-flap-anim-frames` | 3 frames of the screw-flap opening (code crossfades) | M1 | — | P1 |

## D. The bot — 15 files

The bench bot and the playroom bot are the same character at two scales. Assembly is layered: chassis + one body layer per fitted brick + face.

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `bot/chassis` | Baseplate outline figure: friendly empty robot silhouette with all six socket apertures + card holder slot; dashed "assembly guide" inner lines like leaflet diagrams | M1 | — | P0 |
| `bot/body-head` `body-backpack` `body-belt` `body-visor` `body-wheels` `body-shield` | Fitted-state body layers, registered to chassis origins; visually the brick "become" a body part | M1 | tint (matches brick) | P0 |
| `bot/face-idle` `face-thinking` `face-happy` `face-confused` `face-celebrating` `face-stopped` | Expression layers for `#face-slot`: eyes + mouth + antenna attitude. Thinking = spiral eyes + raised antenna; stopped = gentle power-down lids (never distressing) | M1 | — | P0 |
| `bot/pose-walk` | Playroom sprite pose: side profile, one wheel-roll lean; author right-facing (code mirrors for left) | M1 | face-slot | P0 |
| `bot/pose-carry` | Arms-up carrying pose, item mounts at documented origin | M1 | face-slot | P0 |

## E. Playroom scene — 20 files

The stage. Backdrop is M3; manipulable items read as M1 toys *in* the scene (§1). Cell size on screen: 1 U.

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `playroom/backdrop` | 8×6-cell room: terracotta rug (`--cab-rug`) with woven-dash texture, warm walls, skirting, window with rainbow decal (box-art nod), toy-shelf wallpaper hints. Includes subtle 1 U grid articulation in the rug weave (legibility without looking like a spreadsheet) | M3 | — | P0 |
| `playroom/toy-chest` | The container: closed / open (lid up, interior visible) / locked (chunky padlock) as state layers | M1-in-M3 | state ×3 | P0 |
| `playroom/shelf` | Low shelf furniture piece (blocks display) | M3 | — | P0 |
| `playroom/table` | Low round table (snack location) | M3 | — | P0 |
| `playroom/teddy-idle` | Teddy sitting, box-art faithful | M3 | — | P0 |
| `playroom/teddy-happy` | Teddy arms-up delighted (success reactions) | M3 | — | P0 |
| `playroom/item-snack` | Biscuit in a bowl (box-art snack) | M1-in-M3 | — | P0 |
| `playroom/item-block-a/b/c` | Three letter blocks (C, A, B — red/blue/yellow) | M1-in-M3 | — | P0 |
| `playroom/item-red-key` | Chunky red key, unmistakable | M1-in-M3 | — | P0 |
| `playroom/item-ball` | Striped ball (distractor object) | M1-in-M3 | — | P0 |
| `playroom/bubble-speech` | 9-patch speech bubble, cream card with ink text zone | M2 | 9-patch | P0 |
| `playroom/bubble-thought` | 9-patch cloud thought bubble (bench + playroom thinking) | M2 | 9-patch | P0 |
| `playroom/fx-confetti` | 12 confetti particles (token colours) for code animation | M2 | — | P1 |
| `playroom/fx-sparkle` | 3-frame sparkle (pickup/success accents) | M1 | — | P1 |
| `playroom/fx-denied-stamp` | "SAFETY FIRST" rubber-stamp roundel (guardrail denial moment) | M2 | — | P1 |
| `playroom/fx-zzz` | Snooze puffs (out-of-steps bot) | M2 | — | P1 |
| `playroom/fx-question-puff` | Confusion puff (malformed-output "mumble" moment) | M2 | — | P1 |
| `playroom/cell-highlight` | Soft target-cell glow tile (approval-mode "proposed move" preview) | M1 | tint | P1 |

## F. Goal Cards — 11 files

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `cards/card-template` | 2.5×3.5 U laminated card: cream face, green header rule, title zone, body text zone, thumbnail window, difficulty-pip row, rounded corners, lamination specular strip (the one M2 asset with a specular — it's laminated) | M2 | label (title/body live text), pips (code) | P0 |
| `cards/card-back` | Repeating logo pattern back + "CRAFT A BOT GOAL CARD" | M2 | — | P1 |
| `cards/thumb-say-hello` … `thumb-free-play` | Six painted scene thumbnails (1.5 U wide) matching the starter cards (`02` §3); free-play thumb = blank card with marker pen | M3 | — | P0 |
| `cards/card-holder` | The bot's card holder slot (chassis-mounted clip frame) | M1 | state-empty/held | P0 |
| `cards/card-rack` | Bench-bottom rack rail holding up to 8 cards at a tilt | M1 | — | P0 |
| `cards/pip-stud` | Difficulty pip as a tiny stud (filled/empty states) | M1 | state ×2 | P0 |

## G. Bench, shelf & boxes — 10 files

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `bench/workbench-surface` | Warm wood bench top (tileable horizontally) with a cream "building mat" area where the chassis sits; pegboard back panel behind the parts tray | M3 | tileable | P0 |
| `bench/parts-tray` | Moulded inner tray (the vacuum-formed kit tray): 6 large brick wells + cartridge row + card row; each well shows a recessed silhouette of its part when empty | M1 | per-well state-empty/stocked | P0 |
| `shelf/shelf-unit` | Wooden shelf: vertical tileable plank-and-backboard section (holds N boxes per row) | M3 | tileable | P0 |
| `shelf/agent-box-template` | The generated agent box: lid art zones — name plate (live text), brick colour-strip (code-composed from §B icons), contents list panel, sticker anchor points; front + 3/4 views as layers | M2 | label, composition seed, state: front/3-4 | P0 |
| `shelf/agent-box-shrinkwrap` | "New bot" box: template + shrink-wrap sheen + "OPEN ME!" starburst sticker | M2 | — | P0 |
| `shelf/sticker-set` | Starburst, price-tag ("COMING SOON"), oval AGES-style, "NEW!" flash — for boxes and expansion teasers | M2 | label on tag/oval | P1 |
| `shelf/expansion-multipack-thumb` | LLM Multi-Pack box thumb from existing art (web-optimised crop) + greyed variant | M2 | state: available/soon | P1 |
| `bench/mode-switch` | Big two-position BUILD/PLAY toggle: moulded rocker housing with embossed labels, thrown-left/right states | M1 | state ×2 | P0 |
| `bench/go-lever` | The GO lever: red ball-top handle, yellow slot housing, embossed GO; states: idle / pulled / disabled (grey overlay layer) | M1 | state ×3 | P0 |
| `bench/build-checks-ribbon` | Cream ribbon strip with ink text zone + brick-coloured check chips (chip = mini stud with tick/cross) | M2 | 9-patch, label | P0 |

## H. Controls kit (panel chrome) — 9 files

All M1, all parametric where noted. Pressed/hover/focus behaviour is code; art ships the physical housing (+ listed state layers).

| ID | Spec | Params | Pri |
|---|---|---|---|
| `controls/button-primary` | Chunky red push-button, 3 px darker rim, 9-patch stretchable for label width | tint, label, 9-patch | P0 |
| `controls/button-secondary` | Smaller blue variant | tint, label, 9-patch | P0 |
| `controls/rocker` | Vintage rocker switch, on/off thrown states, embossed I/O | state ×2 | P0 |
| `controls/dial` | Rotary dial: tick-ring base (tick count drawn by code) + knurled knob with pointer (code rotates knob) | — | P0 |
| `controls/slider` | Slide potentiometer: track with detent notches + fader cap (code positions) | — | P0 |
| `controls/meter-battery` | Segmented battery meter housing + one segment cell (code repeats/fills; final 2 segments zone tinted red in housing) | segment tint | P0 |
| `controls/status-lamp` | Domed indicator lamp with bezel; lens tinted via `--part-tint` (amber/green/blue/red per `03` §5.1); glow layer for code pulse | tint, state-glow | P0 |
| `controls/panel-frame` | 9-patch cream panel with colour tab poking from top edge (tab label = live text) | tint (tab), label, 9-patch | P0 |
| `controls/drawer-handle` | Moulded pull-handle for leaflet/trace drawers, embossed label zone | label | P0 |

## I. Iconography — 24 files

Two sets, one style: **moulded roundels** — white glyph on token-colour disc with M1 finish, 24 px glyph grid, ≥ 2 px strokes, authored at 1 U.

**Trace/event set (10, P0)** — colour = brick mapping (`04` §2.2): `icons/ev-sense` (eye) · `ev-prompt` (document/envelope hybrid) · `ev-think` (bulb-in-cloud) · `ev-decision` (signpost) · `ev-tool` (spanner) · `ev-action` (forward arrow) · `ev-memory` (open scrapbook) · `ev-guardrail` (shield-check) · `ev-approval` (raised hand) · `ev-error` (soft bang star).

**UI set (14, P0/P1)**: `ui-play` `ui-pause` `ui-step` (footprint arrow) `ui-stop` `ui-reset` (rewind arrow) — P0; `ui-export` (box-with-arrow) `ui-import` `ui-duplicate` `ui-bin` (toy bin) `ui-settings` (screwdriver+screw) `ui-sound-on` `ui-sound-off` `ui-flip` (the "?" flip-over) `ui-pin` — P0 where WP6/7 needs them, rest P1.

## J. Instruction Leaflet & badges — 13 files

| ID | Spec | Family | Params | Pri |
|---|---|---|---|---|
| `leaflet/paper-bg` | Fold-out leaflet sheet: aged cream, two crease shadows, staple pair, worn corners | M2 | 9-patch-ish (stretch middle panel) | P1 |
| `leaflet/cover-panel` | Leaflet cover: mini logo, "READ ME FIRST!", exploded-bot line diagram | M2 | — | P1 |
| `leaflet/step-roundels` | Numbered roundels 1–9 in one file (blue disc, cream numeral) | M2 | — | P1 |
| `leaflet/arrow-stickers` | 4 curl-style pointing stickers (N/E/S/W) for overlay callouts | M2 | — | P1 |
| `leaflet/diagram-lines` | Dashed assembly-line style kit: arrow, bracket, magnifier ring (for tutorial overlays) | M2 | — | P1 |
| `badges/badge-first-words` `badge-eyes-open` `badge-elephant-memory` `badge-tool-time` `badge-key-finder` `badge-safety-first` | Six merit-badge rosettes (one per tutorial chapter, `02` §9): starburst rosette + chapter motif + ribbon tails; earned/unearned (greyed) states | M2 | state ×2 | P1 |
| `badges/rosette-goal-achieved` | The big SUCCESS rosette ("GOAL ACHIEVED!") for end cards | M2 | — | P1 |
| `badges/badge-template` | Blank rosette for future chapters/packs | M2 | tint, label | P2 |

## K. End cards & moment screens — 7 files

Composed scenes: card frame (M2) + bot pose + props. New art = the poses; frames reuse `controls/panel-frame` at full-screen scale.

| ID | Spec | Pri |
|---|---|---|
| `moments/pose-success` | Bot mid-victory-dance, arms up (pairs with rosette + confetti) | P1 |
| `moments/pose-sat-down` | Bot sat on the rug, "out of steps", zzz-compatible | P1 |
| `moments/pose-salute` | Safety brick character salute (guardrail stop — the shield brick with a face for this moment) | P1 |
| `moments/pose-wave` | Bot waving (stopped by user — friendly, no sulk) | P1 |
| `moments/pose-tinker` | Bot with one loose spring + screwdriver nearby (error — "needs a tinker") | P1 |
| `moments/screen-bigger-table` | Phone politeness screen: bot at a too-small table (`03` §10) | P1 |
| `moments/screen-empty-shelf` | First-run shelf art: the single MVFA box with "Open me!" (composition guide using §G assets) | P1 |

## L. Textures & finish library — 9 files

| ID | Spec | Pri |
|---|---|---|
| `textures/paper-grain` | 512 px tileable noise (multiply, 3–5 %) | P0 |
| `textures/halftone-dot` | 512 px tileable dot grid, 6 px pitch | P1 |
| `textures/edge-wear-1..4` | Four corner/edge wear decals | P1 |
| `textures/wood-warm` | 512 px tileable warm wood (bench/shelf base) | P0 |
| `textures/rug-weave` | Woven-dash overlay tile for the rug | P1 |
| `textures/shrinkwrap-sheen` | Diagonal sheen overlay for the new-bot box | P1 |

*(Plastic speculars and AO are SVG gradient recipes per §4 — defined in code/`tokens.css`, no bitmap needed.)*

## M. Existing box art (housekeeping) — 4 files

Copy the four source PNGs into `assets/boxart/` under their canonical names (`04` §10): `my-very-first-agent.png`, `agent-builder.png`, `ai-architect.png`, `llm-multipack.png` + produce web-optimised 800 px crops for shelf/expansion use (P0 for the multipack crop, P2 rest).

---

## Manifest summary

| Category | Files | P0 | P1 | P2 |
|---|---|---|---|---|
| A Brand | 8 | 0 | 5 | 3 |
| B Bricks & sockets | 19 | 18 | 1 | 0 |
| C Cartridges & power | 7 | 6 | 1 | 0 |
| D Bot | 15 | 15 | 0 | 0 |
| E Playroom | 20 | 14 | 6 | 0 |
| F Goal Cards | 11 | 10 | 1 | 0 |
| G Bench, shelf & boxes | 10 | 8 | 2 | 0 |
| H Controls | 9 | 9 | 0 | 0 |
| I Icons | 24 | 19 | 5 | 0 |
| J Leaflet & badges | 13 | 0 | 12 | 1 |
| K Moments | 7 | 0 | 7 | 0 |
| L Textures | 9 | 2 | 7 | 0 |
| M Box art | 4 | 1 | 0 | 3 |
| **Total** | **156** | **102** | **47** | **7** |

**Production order (matches `09-ROADMAP.md` — placeholders unblock everything, art lands in waves):**
Wave 1 (P0 core, unblocks WP5–6 swap-in): B → D → H → G(bench) → F(template+thumbs) → E(backdrop+chest+teddy+items) → L(P0).
Wave 2 (P0 rest + WP7): C → I(trace set) → G(shelf/boxes) → E(bubbles).
Wave 3 (P1, release): J → K → A → remaining I/E/L → M.

## Open items for the visual workstream kickoff

1. Confirm final typefaces against licences (`04` §3) before any text is baked into art.
2. Choose the source-file tool (Figma vs Affinity) and where `assets-src/` lives.
3. Prototype **one** brick (suggest `brick-memory`) end-to-end through §4/§6/§8 first — lock the recipe with a real artefact before fanning out to all 155.
4. Decide whether M3 backdrops are hand-painted, AI-generated-then-cleaned, or hybrid; whichever it is, it must hit the §5 M3 rules and pass the §8 checklist identically.

---

## Status at WP10 (2026-08-12)

**No artwork has been produced.** Every category in this manifest is still standing in as CSS and design tokens: brick silhouettes, sockets, the baseplate, goal cards, panels, the GO lever, the leaflet's paper and creases, and all six merit-badge rosettes. The one real asset in the repo is `favicon.svg`.

That is why `09-ROADMAP.md` WP10 ships as *release-ready except art* and the `v1.0.0` tag is held: the toy currently looks like a wireframe of itself.

What the code already provides, so art can land without touching logic:

- **Tokens, not literals.** No component hard-codes a colour, radius or duration; everything reads `tokens.css` (hard rule 6). Re-skinning is a token change plus an asset swap.
- **Silhouette hooks.** `BrickShape.svelte` and `SocketShape.svelte` own every brick and socket outline. The six distinct silhouettes `04` §7 requires for non-colour differentiation are drawn there and nowhere else.
- **`--part-tint`.** Already wired, so a single template can be recoloured per brick kind without new files.
- **Reduced-motion paths.** Every animation already has an instant-state fallback, so animated art inherits it.

The swap-in seams are therefore CSS-level. The remaining work is production, not integration.
