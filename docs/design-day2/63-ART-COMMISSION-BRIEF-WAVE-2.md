# 63 — Art Commission Brief, Wave 2 (the Workshop; drop-in specification)

> The production companion to `11-VISUAL-ASSET-MANIFEST.md` for the Workshop, in the mould of `20-ART-COMMISSION-BRIEF.md` — **`11-…` says what to draw and why; this says exactly what to deliver so it drops into the repo without a conversation.** Where the two disagree, `11-…` wins on intent and this document wins on numbers.
>
> Scope (`41-TARGET-DESIGN-V4.md` §6.12's last bullet, `42-…` WP73, `62-THE-TAIL.md` §4): **fourteen files** — the Playground's box, the eleven Workshop instrument roundels, the two Control Room finishes. Every one has a **placeholder in the repo already** at the exact path, drawn to this contract and held by `lib/assets/wave2.test.ts`; the delivery replaces each by name and nothing else changes.
>
> Prerequisite reading: `20-…` §1 (the unit trap), §2 (the palette — the same seventeen colours, unchanged), §3 (the delivery contract), and `11-…` §I and §L. Nothing in those is repeated here except where wave 2 differs.
>
> Written 2026-09-07.

---

## 1. What is different from wave 1

Three things.

**The audience.** Wave 1 dressed the Kit for a five-year-old; wave 2 dresses the Workshop, `15-…` §5's "bench instrument" — brushed metal, graph paper, engraved labels, Braun restraint. The roundels keep the Kit's moulded family (`11-…` §I) so the two modes are visibly one toy, but they sit on metal and paper rather than on a rug, and read at **20 px** beside a label rather than at 48 px on a brick.

**The placeholders are the contract, executed.** In wave 1 the code drew emoji and CSS until the art landed (`20-…` §4). Here every file already exists as a geometric placeholder that passes every check the delivery must pass, so `lib/assets/wave2.test.ts` says today what will be asked of the delivery, and the swap-in is a copy over the same name. Look at the placeholder for the origin, the ids and the tint before drawing.

**Two files are textures, not pictures.** They tile; §5.3 says how they are used and what their pixel budget is.

## 2. Palette and units

`20-…` §2's table is the whole palette, unchanged. Three of its rows matter most here and are worth restating:

| Token | Hex | Wave 2 role |
|---|---|---|
| `--cab-teal` | `#3E8F8A` | The **instrument** accent — every roundel's disc and the Playground box, by default. An accent, not a brick colour; the roundel is not a brick |
| `--cab-cream` | `#F3E9D2` | The glyph on every disc; the box's device |
| `--cab-blue` | `#2456A6` | The graph-paper rule, at 6 % |

Three Workshop tokens exist in `tokens.css` that the SVGs must **not** paint, because the components paint them and the textures sit on top: `--cab-metal` `#C9C4B6`, `--cab-graph` `#EFE8D6`, `--cab-engrave` `#4D463C`. A texture is transparent where the panel shows through.

Dimensions are absolute pixels at 1× (`20-…` §1). Author at 1×.

## 3. Delivery contract

`20-…` §3 applies unchanged — optimised SVG, ≤ 30 KB per part, kebab-case, `viewBox="0 0 W H"`, no transform on the root, no editor metadata, uppercase 6-digit hex only, never `rgb()`. Two additions:

- **Every `id` this brief names must be present** with the stated role; ids become `data-part` at runtime (`lib/assets/inline.ts`), so no file may refer to one of its own ids (no `url(#…)`, no `<use href="#…">`). The test refuses a file that does.
- **`--part-tint` on the disc and on the box**, as `fill="var(--part-tint, #3E8F8A)"` — the literal fallback is the teal, so the file renders correctly before any CSS is written.

Paths: `apps/workbench/src/lib/assets/{instruments,finishes,brand}/`.

## 4. What "drop-in" requires — done

Unlike wave 1, nothing on the code side waits for the art. The seams (`62-…` §4.1–4.2) are built and proven on the placeholders:

| Group | Seam | Where it shows |
|---|---|---|
| Roundels | `lib/assets/instruments.ts` → `Roundel.svelte` → `Strip`'s `icon` | The Bench Dashboard's telemetry strip (`tape`), Assurance (`case`), the Playground index and its four desk pages (`desk`) |
| Finishes | `lib/assets/finishes.ts` → two custom properties on the Workshop's root → every instrument's `background-image` | Every strip, meter and Boundary map (graph); every readout, table header, chain and matrix header (metal) |
| The box | `TEMPLATES.boxPlayground` → the Kit's shelf, the Retail Bank Playground box | `/` (the shelf), tinted `--cab-teal` |

Delivering a file is the whole of the swap. `lib/assets/wave2.test.ts` is the acceptance run.

## 5. Wave 2 artefacts — 14 files

### 5.1 The Playground's box — 1 file · `assets/brand/`

| File | Canvas | Replaces |
|---|---|---|
| `box-playground.svg` | 96 × 96 | The placeholder: a tinted rounded panel with a cream desk-and-figure device |

The Retail Bank Playground's box on the Kit's shelf (`03-…` §3; `41-…` §6.12): the one box that is a *place* rather than a pack of bricks — a high-street bank counter, seen as a toy. Same family as the bot boxes' `box-sticker` (`20-…` §5.5): a moulded panel with the M1 finish, one device, no text.

- **Ids:** `#tint` — the panel, `fill="var(--part-tint, #3E8F8A)"`; `#outline` — the ink outline; `#specular` — the highlight (`#FFFFFF` at 35 %); `#glyph` — the device, in `--cab-cream`; `#emboss` — an **empty** group at the panel's centre, reserved for a word the app may set later. Keep it empty.
- **Palette:** the panel tinted; the device cream; outline ink. No brick colours — the Playground is not a brick.
- **Acceptance:** reads as "a bank counter" at 48 px on the shelf beside six bot boxes; distinguishable from every bot sticker as a flat silhouette.

### 5.2 The instrument roundels — 11 files · `assets/instruments/`

> **Amended 2026-09-11 (WP91, `81-THE-TAIL-DAY5.md` §3).** Five more roundels to the same contract, placeholders in the repo already: `icon-pipeline` (three stage cards joined), `icon-clock` (a dial and two hands), `icon-lens` (a ring and a handle), `icon-experiment` (a flask with a level line), `icon-register` (a ledger page, three rules, a tick). Sixteen roundels; nineteen files in the wave.

> **Amended 2026-09-12 (WP100, `87-JOURNEY-CANVAS.md` §5).** Two more to the same contract, placeholders in the repo: `icon-journey` (two lanes, three stage roundels, the edges between them) and `icon-point` (a gate on a line, a tick inside). Eighteen roundels; twenty-one files in the wave.

> **Amended 2026-09-12 (WP101, `88-STUDIO.md`).** One more: `icon-stack` (three bars stacked). Nineteen roundels; twenty-two files in the wave.

The moulded roundel of `11-…` §I — a disc in a token colour, the glyph in cream, ≥ 2 px strokes at 24 px, authored here at **96 × 96** with a 6-px stroke — one per Control Room instrument or screen (`44-CONTROL-ROOM.md` §4.4 for what each instrument is).

| File | Stands for | Glyph brief | Where it is meant to sit |
|---|---|---|---|
| `icon-meter.svg` | `Meter` — a rate against a gate | A half-dial with a needle past the mark | The Guards and Evaluators screens' strips; a gate table's header |
| `icon-lamp.svg` | `Lamp` — pass / fail / live | A lit disc with its short rays; **not** a tick or a cross, which are the statuses' own glyphs | A verdict column's header |
| `icon-tape.svg` | `Tape` — a time series | A ribbon with one clear peak | The Bench Dashboard's telemetry strip; `/telemetry` |
| `icon-matrix.svg` | `Matrix` — the campaign grid, the confusion matrix | A 3 × 3 grid, one cell filled | Campaigns' summary strip |
| `icon-chain.svg` | `Chain` — principal and delegation | Three links, the middle one turned | The Run Lab's chain panel |
| `icon-case.svg` | `CaseFile` / the assurance pack — the file after the fact | A folder with a tab, closed | Assurance; the Run Lab's case file |
| `icon-desk.svg` | The desk — a counter with someone behind it | A counter with a figure's head above it | The Playground and its desks |
| `icon-deck.svg` | A deck of scenarios | Two cards, the back one offset up and right | Scenarios; a desk page's deck table |
| `icon-cassette.svg` | A cassette — a recorded service line | A cassette with two reels and the tape between them | The Connector's picker; a line's row |
| `icon-cohort.svg` | A cohort — a slice of customers | Three figures, the middle one taller | A campaign's cohort slice |
| `icon-boundary.svg` | The Boundary map — the agent inside its ring | A ring with a small square at the centre and one dot outside, tethered | The Spec Lab and Run Lab Boundary panes |

- **Ids:** `#disc` — `fill="var(--part-tint, #3E8F8A)"`, `r` 44 at (48, 48); `#outline` — ink, 3 px; `#specular` — the M1 highlight, top-left; `#glyph` — a `<g>` carrying the device in `#F3E9D2`, stroke or fill.
- **Acceptance:** all eleven distinguishable as flat cream-on-teal at **20 px**, side by side, and none mistakable for a status glyph (`✓ ✕ ? ●`) or a lane glyph. The lamp is the risk; it must read as a *light*, not a *verdict*.

### 5.3 The finishes — 2 files · `assets/finishes/`

Textures, not pictures: each tiles seamlessly at its canvas and is painted **over** the component's own token colour, so it is transparent everywhere it does not mark.

| File | Canvas | Replaces | Brief |
|---|---|---|---|
| `finish-graph.svg` | 16 × 16 | The placeholder: one hairline rule at the top and left edges, `#2456A6` at 6 % | Graph paper: the rule may gain a heavier line every fourth tile only if the file stays 16 × 16 (draw the heavier line at one edge, so four tiles make the square). Paper grain, if any, ≤ 3 % and tileable |
| `finish-metal.svg` | 64 × 64 | The placeholder: eight horizontal hairlines, four white at 10 %, four ink at 5 % | Brushed metal: horizontal grain, no diagonal (it will sit under engraved labels), no specular that would repeat every 64 px visibly. Contrast against `--cab-engrave` text on `--cab-metal` must stay ≥ 4.5:1 — `contrast.test.ts` holds the tokens; the texture must not eat into that margin, so nothing in it is lighter than `#FFFFFF` at 12 % or darker than `#2B2620` at 8 % |

- **Ids:** none required; keep the placeholders' (`#rule`, `#brush-light`, `#brush-dark`) if it helps.
- **Palette:** `#2456A6`, `#FFFFFF`, `#2B2620` with opacity attributes — never a blended hex.
- **Budget:** ≤ 4 KB each. They are inlined as `data:` URLs into a custom property on every Workshop page; a heavy texture is a heavy page.
- **Acceptance:** tiled across a 1280-px strip, no seam visible at 100 %; every Workshop screenshot in `e2e/__screenshots__/` still passes axe.

## 6. Deliberately not in this brief

| `11-…` category | Why deferred |
|---|---|
| I. The trace/event set (10) and the UI set (14) | The lanes keep their glyphs (`dataviz.ts`); a later wave, once the Run Lab's row design settles |
| B, C, F, H, K, L (the Kit's own) | `20-…` §6's table stands |
| Box art for the other shop packs | Text until they are more than "coming soon" |

## 7. Definition of done

`11-…` §8's eight points and `20-…` §7's three, plus:

12. **`lib/assets/wave2.test.ts` green** with the delivered files in place of the placeholders — it is the checklist, executed.
13. **The roundels at 20 px**: a screenshot of the seven strips (`npm run e2e:visual`) with all eleven visibly distinct in a contact sheet the illustrator supplies.
14. **The finishes tile** with no seam, and every Workshop screenshot re-baselined in the same PR, deliberately (`60-…` §2 item 5).

## 8. Open questions for the kickoff

1. **Sources.** `20-…` §8's question 2 is still open (on a drive). Wave 2 is fourteen files; keeping their `.afdesign` or scripts in `assets-src/` in-repo would close it.
2. **A word in `#emboss`.** The box reserves it; nothing sets it. If the shelf ever prints "PLAYGROUND" there, the app renders it in the UI face — the illustrator needs no font.
3. **Icons for the lanes.** If wave 3 is the trace/event set, the roundel family here should be drawn so the lanes' ten can join it without redrawing these eleven.
