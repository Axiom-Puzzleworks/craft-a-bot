# 20 — Art Commission Brief, Wave 1 (drop-in specification)

> The production companion to `11-VISUAL-ASSET-MANIFEST.md`. **`11-…` says what to draw and why; this says exactly what to deliver so it drops into the repo without a conversation.** Where the two ever disagree, `11-…` wins on intent and this document wins on numbers — and the disagreement is a bug in one of them.
>
> Scope: the artefacts the running app is currently blocked on — every place the code renders a placeholder today, plus the five FX that WP16 and WP17 designed against and could not draw. The remaining manifest categories (§6) follow this same template when their wave is commissioned.
>
> Prerequisite reading for the illustrator: `11-…` §1–§8 (material families, the one-sun rule, texture recipes, the named-group convention). Nothing in those sections is repeated here.

---

## 1. The unit trap — read this first

`11-…` §2 defines **1 U = 96 px** at 100 % zoom, authored on a 24 px sub-grid (¼ U).

`tokens.css` defines `--cab-u: 24px`, with a comment calling it "the stud unit … every moulded part is sized in multiples of U". **That token is the ¼ U sub-grid, not U.** A developer reading the token and an illustrator reading the manifest will differ by a factor of four.

> **Action for the code side (WP18, not the illustrator):** rename the token to `--cab-sub` or correct its comment, and amend `11-…` §2 with a dated note. Until that happens, treat the manifest as correct.

**Every dimension in this brief is given in absolute pixels at 1×.** Do not convert from U. Author at 1×; the app scales in CSS.

| Reference | Pixels |
|---|---|
| 1 U (one stud pitch, one Playroom cell) | 96 |
| ¼ U sub-grid (the CSS `--cab-u`) | 24 |
| Minimum scene item | 72 (0.75 U) |
| Minimum control, either dimension | 48 (0.5 U) |
| Minimum brick on the bench | 192 (2 U) |

---

## 2. Palette — the only colours permitted

No hex outside this table may appear in a delivered SVG (`11-…` §8.5 is an automated check). Use the CSS variable name in the SVG where the asset is tinted at runtime; use the literal hex where it is fixed.

| Token | Hex | What it means — never repurpose |
|---|---|---|
| `--cab-cream` | `#F3E9D2` | Paper/card surfaces, light text on dark grounds |
| `--cab-paper` | `#EFE3C8` | The page behind everything; card interiors |
| `--cab-ink` | `#2B2620` | Outlines, type, the one dark |
| `--cab-ink-muted` | `#5C5348` | Secondary text only (never an outline) |
| `--cab-cream-muted` | `#CFC4AB` | Secondary text on ink grounds |
| `--cab-blue` | `#2456A6` | **LLM / brain** |
| `--cab-green` | `#4E8A3C` | **Memory** |
| `--cab-purple` | `#6C4F9E` | **Tools** |
| `--cab-sky` | `#5484BB` | **Sense** |
| `--cab-red` | `#C93A2E` | **Actions** |
| `--cab-yellow` | `#E9B62F` | **Safety** |
| `--cab-teal` | `#3E8F8A` | Accent only — not a brick colour |
| `--cab-orange` | `#D77A3C` | Accent / warnings |
| `--cab-board` | `#7A5C3E` | Bench and shelf wood |
| `--cab-rug` | `#C9705E` | Playroom rug terracotta |
| `--cab-plastic-hi` | `#FFFFFF` at 35 % | Specular highlight only |
| `--cab-shadow` | `#000000` at 15 % | Drop shadows only |

**The colour↔concept mapping is law** (`04-…` §2.2). A Memory artefact is green; nothing else is.

**Forbidden pairs** (`04-…` §7, and the suite asserts they fail): white on `--cab-yellow`, white on `--cab-sky`. Any in-asset text must clear **4.5:1** against its actual background.

**Do not dim text with opacity.** Use `--cab-ink-muted` / `--cab-cream-muted`. This cost us five failing routes in WP17; see `04-…` §2.3.

---

## 3. Delivery contract

| | |
|---|---|
| **Format** | Optimised SVG. SVGO, 2 dp precision, no editor metadata |
| **Budget** | ≤ 30 KB per part, ≤ 80 KB per scene |
| **Path** | `apps/workbench/src/lib/assets/{category}/{name}[--{variant}].svg` |
| **Naming** | kebab-case; variants only for baked states — `toy-chest--locked.svg` |
| **viewBox** | `0 0 {W} {H}` matching the canvas below, origin top-left, **no transform on the root** |
| **Editable sources** | `assets-src/` (not shipped) |

**Named-group contract** (`11-…` §6). Where a spec below names a slot, it must be present, empty, and at the stated origin:

- `#emboss` — moulded label text, replaced by the app
- `#icon-slot` — empty `<g>` at a fixed origin for a category icon
- `#face-slot` — empty `<g>` where an expression mounts
- `#state-*` — optional hidden layers (`#state-open`, `#state-locked`)
- `--part-tint` — a CSS custom property the app sets; use `fill="var(--part-tint)"` on the tintable shape, with a literal fallback

---

## 4. What "drop-in" actually requires

**Honest position: there is no asset pipeline today.** `apps/workbench/src/lib/assets/` contains one file (`favicon.svg`). The Playroom draws its world with **emoji**, the bricks are **CSS shapes**, and the badges are **CSS rosettes**. Delivering the SVGs is necessary but not sufficient.

Each group below therefore names the code that must change. That work is WP18's, not the illustrator's, and it is small — but it must be scheduled or the art will land in a directory nothing reads.

| Group | Placeholder today | Code that must change |
|---|---|---|
| Bot faces | `lib/bot-expression.ts` `GLYPHS` (emoji) | Swap the glyph map for an SVG map; `WorldView` renders `<img>`/inline `<svg>` |
| Bot poses | `WorldView.svelte` `🤖` | Same; add `#face-slot` composition |
| Scene items | `WorldView.svelte` `ITEM_GLYPHS`, `glyphFor()` | Replace the glyph lookup with an asset lookup keyed by the same ids |
| Furniture / chest | `WorldView.svelte` `🛋 🗄 🧰 🔒` | Asset lookup + `data-state` → `#state-*` |
| Teddy | `WorldView.svelte` `🧸` | Asset lookup; happy variant on SUCCESS |
| FX | none — never drawn | New components; all must honour `prefers-reduced-motion` |
| Box sticker | `lib/box-art.ts` (CSS square) | Keep the seed logic; swap the square for the tinted template |
| Badges | `BadgePage.svelte` CSS rosette | Swap for the rosette template with `#emboss` = chapter number |

---

## 5. Wave 1 artefacts

### 5.1 The bot's face — 6 files · `assets/bot/`

The expression vocabulary is already live in code (`lib/bot-expression.ts`) and drives the placeholder glyphs today.

| File | Replaces (placeholder) | Expression brief |
|---|---|---|
| `face-idle.svg` | 🤖 | Neutral, awake, antenna upright. The resting state |
| `face-thinking.svg` | 🤔 | Spiral eyes, antenna raised |
| `face-happy.svg` | 🤖 | Content — used while a run is going well; must read as *distinct* from idle at 48 px |
| `face-confused.svg` | 😕 | The refusal face (`16-…` §1.2). Puzzled, not sad — the bot is not being told off |
| `face-celebrating.svg` | 🥳 | Delighted. Pairs with confetti |
| `face-stopped.svg` | 😴 | Gentle power-down lids. **Never distressing** — running out of steps is not a failure a five-year-old should feel bad about |

- **Canvas:** 48 × 48 px each. Authored to sit inside `#face-slot`; origin top-left of the slot.
- **Palette:** `--cab-ink` for features; `--cab-cream` for eye whites. No brick colours — the face is not a brick.
- **Contract:** each file is the *contents* of the slot, not a whole bot. No background.
- **Acceptance:** all six distinguishable as flat black at 48 px, side by side.

### 5.2 The bot's body — 2 files · `assets/bot/`

| File | Canvas | Notes |
|---|---|---|
| `pose-walk.svg` | 96 × 96 | Side profile, one wheel-roll lean. **Author right-facing**; code mirrors for left. Contains `#face-slot` at a documented origin |
| `pose-carry.svg` | 96 × 96 | Arms-up carry. Contains `#face-slot` **and** `#icon-slot` where a carried item mounts (item drawn at 48 × 48 centred on that origin) |

- **Palette:** chassis `--cab-cream` with `--cab-ink` outline; wheels `--cab-ink`. Body accents may use brick colours **only** where a fitted brick is being represented.
- **Acceptance:** silhouette test at 64 px; `#face-slot` origin identical in both files, so swapping pose does not move the face.

### 5.3 The Playroom — 13 files · `assets/playroom/`

The grid is **8 × 6 cells**; one cell is 96 px.

| File | Canvas | Spec |
|---|---|---|
| `backdrop.svg` | **768 × 576** | Terracotta rug (`--cab-rug`) with woven-dash texture, warm walls, skirting, window with rainbow decal. Subtle 1 U articulation in the weave — legible without looking like a spreadsheet. M3 |
| `toy-chest.svg` | 96 × 96 | Three baked states as layers: `#state-closed` (default visible), `#state-open` (lid up, interior visible), `#state-locked` (chunky padlock). Code toggles via `data-state` |
| `shelf.svg` | 96 × 96 | Low shelf. M3 |
| `table.svg` | 96 × 96 | Low round table (the snack location). M3 |
| `teddy-idle.svg` | 96 × 96 | Teddy sitting, box-art faithful |
| `teddy-happy.svg` | 96 × 96 | Arms-up delighted. Shown on SUCCESS (`16-…` §2.3) |
| `item-snack.svg` | 72 × 72 | Biscuit in a bowl |
| `item-block-a.svg` | 72 × 72 | Letter **A**, **blue** (`--cab-blue`) |
| `item-block-b.svg` | 72 × 72 | Letter **B**, **yellow** (`--cab-yellow`) |
| `item-block-c.svg` | 72 × 72 | Letter **C**, **red** (`--cab-red`) |
| `item-red-key.svg` | 72 × 72 | Chunky red key, unmistakable at 72 px |
| `item-ball.svg` | 72 × 72 | Striped ball (deliberate distractor) |
| `cell-highlight.svg` | 96 × 96 | Soft target-cell glow. `--part-tint` |

> **The letters and colours are load-bearing.** The world's own narration calls them "a blue letter block (A)", "a yellow letter block (B)", "a red letter block (C)". A block drawn in the wrong colour makes the picture and the trace disagree about the same object — which, in a simulator built for observability, is the worst failure available. This exact bug was fixed once already (`strings.ts`, 2026-08-12); do not reintroduce it.

- **Item files are 72 × 72 on a 96 px cell** — centred, with 12 px clear on each side.
- **Acceptance:** every item distinguishable from every other at 72 px as flat black.

### 5.4 Effects — 5 files · `assets/playroom/`

All five are designed against but **never drawn**; WP16 and WP17 shipped their logic with no art.

| File | Canvas | Spec | Used by |
|---|---|---|---|
| `fx-denied-stamp.svg` | 192 × 192 | "SAFETY FIRST" rubber-stamp roundel, `--cab-red` ink, slightly rough edge, ~8° tilt baked in | Guardrail denial (`16-…` §2.1) |
| `fx-question-puff.svg` | 96 × 96 | Confusion puff | Refused action (`16-…` §1.2) |
| `fx-confetti.svg` | 96 × 96 | **12 particles as 12 sibling `<g>` elements**, each ~12 × 12, ids `#c1`…`#c12`. Token colours only. Code animates them individually | Success (`16-…` §2.3) |
| `fx-sparkle.svg` | 48 × 48 | 3 frames as `#frame-1/2/3`, only one visible at a time | Pickup / success accents |
| `fx-zzz.svg` | 96 × 96 | Snooze puffs | OUT_OF_STEPS |

> **Every effect must be inert when `prefers-reduced-motion: reduce`.** The app already honours the preference globally; deliver the artwork so a **static first frame** is meaningful on its own. An effect that only reads as motion is an effect some children never see.

### 5.5 Identity and badges — 2 templates

| File | Canvas | Spec |
|---|---|---|
| `assets/brand/box-sticker.svg` | 24 × 24 | The per-bot identity sticker. Single tintable shape using `--part-tint`, `--cab-ink` outline. **Deterministic composition is code's job** — `lib/box-art.ts` picks colour, corner and a ±6° tilt from the bot's seed. Deliver one untilted template |
| `assets/leaflet/badge-rosette.svg` | 96 × 96 | Merit-badge rosette with `#emboss` for the chapter number and `#state-earned` for the earned treatment. **Seven chapters** as of WP17 — do not bake a count |

> **Amended 2026-08-15 (WP18).** `11-…` §6's parameter table lists the badge template among the things `--part-tint` applies to; this section did not, and the omission was only visible once the contract was written down as a test. The delivered rosette tints its **rim** (`#tint`), so a chapter can carry a colour without new art — which is the capability §6 says ships now precisely so expansion packs do not need redrawing.

---

## 6. Deliberately not in this brief

These manifest categories have no code placeholder blocking them, so specifying them now would be guesswork against a UI that may still move. Each follows the template above when commissioned.

| `11-…` category | Why deferred |
|---|---|
| B. Bricks & sockets (19) | Currently CSS shapes that satisfy the design language; a swap is a visual upgrade, not an unblock |
| C. Cartridges, batteries & power (7) | Multi-Pack is "coming soon"; only the Demo Brain ships |
| F. Goal Cards (11) | Card holder is text; par display landed in WP16 and the layout is still settling |
| H. Controls kit (9) | Dials, rockers and levers are CSS and pass the touch-target and contrast audits |
| I. Iconography (24) | No icon system in the app yet |
| K. End cards (7) | Copy and the trace-derived hint changed in WP17 §2.3; art should follow settled copy |
| L. Textures (9) | Needed by M2/M3 assets above — commission **with** wave 1 if the illustrator prefers |
| M. Existing box art (4) | Housekeeping |

---

## 7. Definition of done

`11-…` §8's eight-point checklist applies unchanged. This brief adds three:

9. **Exact filename and path** as specified above — the swap-in is mechanical, and a renamed file is a code change.
10. **Static-first**: any animated artefact reads correctly as a single static frame.
11. **Ids present and empty**: every `#face-slot`, `#icon-slot`, `#state-*` and `#emboss` named above exists, contains nothing, and sits at the stated origin.

---

## 8. Open questions for the kickoff

1. **The unit token** (§1) — rename `--cab-u`, or correct its comment? Either resolves it; leaving it is a trap.
2. **`assets-src/` in-repo or on a drive?** `11-…` §7 leaves this open and it affects the illustrator's handover.
3. **Typeface.** `11-…` §3 lists the type scale but the faces "arrive with the visual workstream". Any `#emboss` text is rendered by the app in the UI face, so the illustrator needs no font — but the decision blocks the brand files in category A.
4. **Does the Playroom keep a fixed 8 × 6?** The backdrop is the one asset that hard-codes the grid, at 768 × 576. Every other file is cell-local and survives a resize.

> **Resolved 2026-08-15 (WP18): yes, 8 × 6 stays.** `backdrop.svg` is built against it and is the only file that would need redrawing if it ever changed. The number now lives in exactly two places that are tied together — `GRID` in `lib/assets/index.ts` and an assertion in `lib/assets/assets.test.ts` — so a future change to the grid fails the suite rather than quietly leaving the room the wrong shape.
>
> Question 3 (**typeface**) is *sidestepped, not answered*, for wave 1: every letterform delivered — the blocks, "SAFETY FIRST", the Zs — is drawn as geometric vector paths, so no artefact here depends on a font. It still blocks category A.
>
> Questions 1 (`--cab-u`) and 2 (`assets-src/`) are untouched. Sources are on a drive for now; §1's four-fold trap is still set.
