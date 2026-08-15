# 22 — Wave 1 Handover (WP18)

> All 28 artefacts specified in `20-ART-COMMISSION-BRIEF.md` §5, delivered to the
> exact paths §3 requires. Built in **Affinity 3.2.3.4646** through its JavaScript
> SDK, normalised and validated by a script rather than by eye, per the plan in
> `21-ART-PRODUCTION-PLAN.md`.
>
> **This document exists for the things the brief did not anticipate.** The
> artwork is in the repo and needs no explanation; five conflicts between the
> brief and reality do. They are §3 below. One of them — §3.4, the backdrop's
> projection — was found by review rather than by any check, and is the most
> instructive failure in the wave.
>
> Date: 2026-08-15.

---

## 1. What shipped

| Group | Files | Location |
|---|---|---|
| Bot faces | `face-idle` `face-thinking` `face-happy` `face-confused` `face-celebrating` `face-stopped` | `apps/workbench/src/lib/assets/bot/` |
| Bot poses | `pose-walk` `pose-carry` | `…/bot/` |
| Playroom | `backdrop` `toy-chest` `shelf` `table` `teddy-idle` `teddy-happy` `item-snack` `item-block-a/b/c` `item-red-key` `item-ball` `cell-highlight` | `…/playroom/` |
| Effects | `fx-denied-stamp` `fx-question-puff` `fx-confetti` `fx-sparkle` `fx-zzz` | `…/playroom/` |
| Templates | `box-sticker` | `…/brand/` |
| | `badge-rosette` | `…/leaflet/` |

**28 files, 48,856 bytes total.** The largest is `backdrop.svg` at 17,214 B
against an 80 KB scene budget; the largest part is `toy-chest.svg` at 2,593 B
against 30 KB. The budget was never close to binding.

Editable `.afdesign` sources and the raw Affinity exports are on the Desktop in
`Craft-a-bot affinity\src\` and `\raw\`. The authoring scripts are in
`\scripts\`, and they are the real source: every artefact is a ~40-line program,
so a change is an edit and a re-run rather than a redraw.

**202 checks run, 0 failed** in the build pipeline, and the contract is
re-asserted inside the repo's own suite by `lib/assets/assets.test.ts`. The checklist is `11-…` §8's eight points plus
`20-…` §7's three, executed rather than asserted: viewBox and root, palette
membership after normalising every colour to hex, slot presence and emptiness,
slot origins, hidden state layers, size budget, SVGO cleanliness.

---

## 2. Two things the validator caught that a review would not have

Worth recording, because both were invisible in the rendered artwork.

**SVGO deletes the state layers.** `removeHiddenElems` treats a `display:none`
group as dead weight. `toy-chest`'s open and locked states, `fx-sparkle`'s frames
2 and 3, and `badge-rosette`'s earned treatment were all silently stripped from
files that still looked perfect. Caught by the §7.11 presence check, fixed in the
SVGO config.

**The palette check cannot see an Affinity export.** Affinity writes
`fill:rgb(36,86,166)`, not `#2456A6`. `11-…` §8.5 greps for out-of-palette hex —
so a file containing *no hex at all* passes it while containing any colour the
illustrator liked. This is a hole in the existing automated gate, not in this
wave's artwork. The normaliser converts every colour to uppercase 6-digit hex
*before* asserting membership, and keeps SVGO from shortening `#FFFFFF` to
`#fff`, which would reopen the same hole from the other end.

---

## 3. Conflicts in the brief — three want a decision

### 3.1 §5.3's flat-black acceptance is unsatisfiable for the letter blocks

> "**Acceptance:** every item distinguishable from every other at 72 px as flat
> black."

`item-block-a`, `-b` and `-c` share one outline and differ only by letter and
colour. Flattened to black they are **identical — 0.0 % different**, measured.
No amount of drawing fixes this while they remain a matched set of letter blocks.

The test was therefore split in two, and both run on every build:

| Mode | What it does | Closest item pair |
|---|---|---|
| **outline** | alpha silhouette; the classic squint test | `block-a` / `block-b` — **0.0 %** |
| **mono** | ink/paper at threshold, internal edges preserved | `block-a` / `block-c` — **23.2 %** |

**Proposed amendment to §5.3:** the letter-block trio is judged by the mono test.
This still satisfies what `04-…` §7 actually requires — *colour never carries
meaning alone* — because the cue is the letterform, which is not a colour. What
it gives up is outline distinctness, which three letter blocks cannot have.

The alternative is to vary stud count or proportions so the three differ in
silhouette, at the cost of the matched-set read that makes them legible as "the
letter blocks". **Your call; nothing is blocked either way.** The measurement is
reported on every run regardless, so the failure will never go quiet.

> Related, and already handled: the letter's colour changes per block. A is cream
> on blue, C is cream on red, but **B is ink on yellow** — white on `--cab-yellow`
> is one of §2's two forbidden pairs, and B is the block where that bites.

### 3.2 §5.2 asks for a side profile that cannot hold a frontal face

`pose-walk` is specified as "side profile, author right-facing", and also as
carrying `#face-slot` at the same origin as `pose-carry`. Every face file in §5.1
is a two-eyed frontal design. A true side profile shows one eye, so the two
requirements cannot both be met.

**Resolved by drawing both poses frontal**, with the walk carried by the arms and
a wheel-height offset. The shared slot stays honest and the sprite still mirrors
cleanly. If a genuine profile is wanted, §5.1 needs a second set of profile
faces and §5.2 needs a second slot origin — that is a scope change, not a redraw.

### 3.3 §4's registration table was undefined, so it is defined here

§5.2 requires `#face-slot` at an identical origin in both poses "so swapping pose
does not move the face", without saying where. Fixed, and stamped into the files
as a `transform` on each empty slot group so the origin is machine-checkable
rather than a line in a table someone has to remember:

| Slot | Files | Origin | Size |
|---|---|---|---|
| `#face-slot` | `pose-walk`, `pose-carry` | **24, 14** | 48 × 48 |
| `#icon-slot` | `pose-carry` | **24, 2** | 48 × 48 |
| `#emboss` | `badge-rosette` | **28, 30** | 40 × 36 |

(`21-…` §4 said 24, 16. The head geometry moved during batch A and this table
wins.)

### 3.4 The backdrop was drawn in the wrong projection — corrected

Caught by Andrew on review, and it is the most useful failure in this wave
because it passed *every* automated check that existed at the time.

§5.3 asks the backdrop for "warm walls, skirting, window with rainbow decal" on
a 768 × 576 canvas. Both halves are reasonable; together they are impossible.
The Playroom is seen **from above** — `WorldView` lays the 8 × 6 out as a CSS
grid and puts the backdrop behind it at `inset: 0`, so the artwork and the
playing field are the same rectangle. The first delivery drew the room in
elevation, and the upper rows put the bot, the blocks and Teddy up the wall and
across the glass. A Goal Card sending the bot to (3, 0) would have sent it into
the window.

Everything about that file was correct except the one thing no check was looking
at. It was the right canvas, the right palette, inside budget, SVGO-clean — and
unusable.

**The backdrop is now floor edge to edge.** Boards on the 1 U pitch, so the
seams fall on the cell boundaries and §5.3's "subtle 1 U articulation" is
satisfied by something a playroom actually has rather than by a lattice. The rug
is seen from above and sits well inside the edges, so the corner cells are bare
boarding. **The window survives as the light it throws** — a sunlit patch across
the top-right with its glazing-bar shadows in it, which keeps the warmth and the
time of day at the cost of no walkable cell. The rainbow decal is deferred; it
has nowhere to live in plan view.

`assets.test.ts` now asserts the backdrop uses **only** the four floor tokens
(`--cab-paper`, `--cab-rug`, `--cab-shadow`, `--cab-plastic-hi`). `--cab-board`
is skirting and window frame, `--cab-sky` is glass; either appearing in this file
means a wall has been drawn on a cell the bot walks to. That is the check that
was missing, written as the failure rather than as a rule.

> Walls and window as *drawn objects* would need a **surround** — a separate
> artefact on a larger canvas with a transparent 768 × 576 hole where the grid
> sits — plus padding around `.room`. That is a UI change as much as an art one,
> so it is offered rather than assumed, and it is not in this wave.

### 3.5 §4's dimension recipe, as agreed

Confirmed by spike before any artwork was drawn: **Affinity rasterises
blend-mode layers into embedded PNGs on SVG export.** `11-…` §4 builds every M1
part from neutral layers in multiply/screen over a tintable base, and that cannot
ship as vector.

As agreed, layers 1, 2, 4, 5 and 7 are authored as Normal-blend `--cab-shadow`
(`#000000` @ 15 %) and `--cab-plastic-hi` (`#FFFFFF` @ 35 %). The shading stays
hue-independent, so §6's re-tint capability survives intact. **`11-…` §4 is owed
a dated amendment** recording that the mechanism changed and the intent did not.

---

## 4. Deviations worth knowing about

**No studs on the scene items.** Every studded part in the box art is a part that
connects to the bot, and in a teaching tool the stud is the thing that says *this
is a capability you can fit*. A letter block is scenery the bot carries, not a
brick it wears. `11-…` §1 asks for a "gentle M1 plastic read" on scene items;
gentle is the operative word, and studs would make the picture and the affordance
disagree.

**No blue irises on the bot.** The box art gives the bot blue eyes. `20-…` §5.1
says ink features and cream whites, "no brick colours — the face is not a brick",
and the brief wins: a blue iris puts an LLM colour on something that is not an
LLM. The box art's *shapes* — big whites, thin rim, small pupil, a mouth that is
always a curve — were taken.

**No corner vignette on the backdrop.** `11-…` §5 asks for a soft 10 % one. Soft
means a gradient; four flat triangles at 15 % read as cut corners, not falloff.
Deferred to the texture wave (category L), where it belongs with the grain and
halftone tiles it is supposed to sit alongside.

**`face-idle` and `face-happy` are the tightest pair in the set** — 16.2 % on the
outline test — and that is structural: they share their eyes and antenna by
definition, so the whole burden of §5.1's "must read as *distinct* from idle"
falls on the mouth. Idle's mouth was flattened to a near-level lens specifically
to make room for happy's grin. The pairwise threshold is set at 15 %, which still
catches a genuine duplicate at ~5 %.

---

## 5. ~~What WP18 still owes~~ — done 2026-08-15

> **All eight landed the same day the art did.** The table below is kept as
> written, because it is the accurate record of what was owed; §5.1 is what
> actually happened. Read `20-…` §4's dated note for the mechanism.

`20-…` §4 is honest about this and it has not changed: **there is no asset
pipeline.** Delivering the SVGs was necessary and is not sufficient. The eight
code changes named in §4's table are still outstanding:

| Group | Placeholder today | Change |
|---|---|---|
| Bot faces | `lib/bot-expression.ts` `GLYPHS` (emoji) | Swap the glyph map for an SVG map |
| Bot poses | `WorldView.svelte` `🤖` | Same, plus `#face-slot` composition at (24, 14) |
| Scene items | `ITEM_GLYPHS`, `glyphFor()` | Asset lookup keyed by the same ids |
| Furniture / chest | `🛋 🗄 🧰 🔒` | Asset lookup + `data-state` → `#state-*` |
| Teddy | `🧸` | Asset lookup; `teddy-happy` on SUCCESS |
| FX | none — never drawn | New components; all must honour `prefers-reduced-motion` |
| Box sticker | `lib/box-art.ts` (CSS square) | Keep the seed logic; swap the square for the template |
| Badges | `BadgePage.svelte` CSS rosette | Swap for the rosette; `#emboss` = chapter number |

Two notes for whoever does that work:

- **`--part-tint` is live** on `cell-highlight` (`#tint`) and `box-sticker`
  (`#tint`), as `fill="var(--part-tint, #E9B62F)"` and `…, #2456A6)`. The literal
  fallback means the asset is correct before any CSS is written.
- **Every effect is static-first** (§7.10). `fx-confetti` ships as a scattered
  burst rather than twelve pieces stacked at the origin; `fx-sparkle`'s
  `#frame-1` is a complete sparkle. Under `prefers-reduced-motion: reduce` each
  one still means something.

### 5.1 What was actually done, and what it cost

Both notes above were load-bearing and both paid off — the tint reached the
sticker with one CSS custom property and no JavaScript, and the reduced-motion
path was a `@media` block rather than a second set of drawings.

Four things the handover did not predict, all worth knowing:

1. **Ids had to stop being ids.** Inlining a template many times over — six
   stickers on the shelf, seven rosettes on the sheet — would have put seven
   `#emboss`es in one document. `lib/assets/inline.ts` rewrites every `id` to a
   `data-part`. It is safe precisely because §7.11's contract is about *named
   groups the app addresses*, not about internal references: no wave 1 file
   contains a `url(#…)` or a `<use>`, and the inliner throws if a later one
   does, because that would render *almost* right.
2. **The chest's three states and the sparkle's three frames are the same
   mechanism**, so they are one option (`variants`) rather than two features. So
   is the rosette's `#state-earned`, where the unearned case is simply "choose a
   layer that does not exist".
3. **`assets.test.ts` did not type-check as delivered.** `noUncheckedIndexedAccess`
   is on across the repo, so every `ALL_ASSETS[name]` is `string | undefined`;
   `npm run check` was red on `main` between the art commit and the swap-in. It
   went red a **second** time when §3.4's redraw regenerated the file from the
   out-of-repo pipeline and took the fix with it — which is the practical cost of
   `20-…` §8.2 being open, and the argument for closing it.
4. **§3.1's letter-block question did not need answering to ship.** The mono
   test it proposes is a wave 2 tooling decision. Nothing in the code depends on
   the blocks differing in silhouette: `WorldView` looks each one up by the
   world's own id, and the test that used to compare *letters* now compares
   *colours* — which is the half of "a blue letter block (A)" that markup can
   still be asked about now that the letterform is a path.

**The redraw in §3.4 needed no swap-in change at all**, which is the one useful
proof that the lookup is honest: `WorldView` asks `lib/assets` for a backdrop and
draws whatever comes back, so a room in elevation and a room in plan are the same
call. What it did need was a **test that would have caught it** — `assets.test.ts`
now asserts the backdrop uses only the four floor tokens, because `--cab-board`
is skirting and `--cab-sky` is glass, and either one in that file means a wall
has been drawn on a walkable cell.

---

## 6. Still open

Unchanged from `21-…` §8, and none of it blocked this wave:

1. ~~**`20-…` §8.1** — the `--cab-u` / `--cab-sub` rename.~~ **Closed
   2026-08-15 (WP18):** renamed across all twenty call sites, and there is no
   `--cab-u` any more. The rename rather than the comment fix the brief also
   allowed, because the misleading name is the half that travelled.
2. **`20-…` §8.2** — `assets-src/` in-repo or on a drive. Sources are on the
   Desktop. Not decided, and §5.1's third item is now the cost of that: a
   regeneration outside the repo silently reverted an in-repo fix, twice.
3. **`20-…` §8.3** — the typeface. Sidestepped: every letterform in this wave
   (the blocks, "SAFETY FIRST", the Zs) is drawn as geometric vector paths, so
   nothing here depends on a font. Still blocks brand category A.
4. **`20-…` §8.4 — the one to settle first.** `backdrop.svg` hard-codes the
   8 × 6 grid at 768 × 576; every other file is cell-local and survives a resize.
   It is now built, so changing the grid means rebuilding one file — cheap, but
   cheaper still if it happens before category L layers textures over it.

---

## 7. Rebuilding any of this

```
Desktop\Craft-a-bot affinity\
  scripts\lib.js          the authoring library — palette, path helpers, export
  scripts\art\<name>.js   one program per artefact
  raw\<name>.svg          Affinity's export, before normalising
  normalised\<cat>\…      what shipped
  src\<name>.afdesign     editable Affinity documents
```

The library refuses out-of-palette colours at authoring time rather than letting
the validator find them later, and it exposes only Normal-blend neutrals for
shading, so §2.1's amendment cannot be undone by accident in a future artefact.

`SVG (for export)` is pinned. The `digital - high quality` preset silently
rescaled a 96 × 96 document to a 300 × 300 viewBox during the spike — every
artefact would have landed in the wrong coordinate space, consistently and
invisibly.
