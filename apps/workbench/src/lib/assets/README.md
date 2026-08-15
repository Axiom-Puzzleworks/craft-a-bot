# `lib/assets` — wave 1 art

The 28 artefacts commissioned in `docs/design-day2/20-ART-COMMISSION-BRIEF.md`
§5, delivered 2026-08-15. What they are and why they look like that is in
`21-ART-PRODUCTION-PLAN.md` and `22-WAVE-1-HANDOVER.md`. This file is the part
you need in order to _use_ them.

## Import them from `index.ts`, not by path

```ts
import { BOT_FACES, SCENE_ITEMS, SLOT_ORIGINS } from '$lib/assets/index.js';
```

Everything is imported `?raw` and handed out as markup rather than as a URL.
That is not a preference. §3's contract is built on named groups —
`#face-slot`, `#icon-slot`, `#state-*`, `#emboss` — and on `--part-tint`, and
none of those can be reached through an `<img src>`. Inline, or the contract is
decoration.

`index.ts` is also **the only place a world id may be mapped to a picture.** The
filenames carry an `item-` prefix that the world's ids do not, so a second
mapping is exactly the kind of thing that drifts. It has drifted here before: on
2026-08-12 the grid drew the blue A block as a "C" while the trace called it "a
blue letter block (A)". `assets.test.ts` asserts this mapping against the world
the pack actually builds, across every layout.

## The four mechanisms

**Faces mount into a pose.** `BOT_FACES[expression]` is the _contents_ of
`#face-slot` — 48 × 48, no background, not a whole bot. Both poses put the slot
at the same origin (`SLOT_ORIGINS['face-slot']`, stamped into the files as a
`transform`), so swapping pose does not move the face.

**States are baked layers, switched by the app.** `toy-chest.svg` is one file
carrying `#state-closed`, `#state-open` and `#state-locked`; the last two ship
`display="none"`. `WorldView` already sets `data-state` from `container.state`,
so the swap is a stylesheet:

```css
[data-state='open'] #state-closed {
	display: none;
}
[data-state='open'] #state-open {
	display: block;
}
```

Same shape for `fx-sparkle` (`#frame-1/2/3`) and `badge-rosette`
(`#state-earned`).

**Tintable parts take a CSS custom property.** `#tint` on `cell-highlight`,
`box-sticker` and `badge-rosette` is `fill="var(--part-tint, #TOKEN)"`. Setting
the property recolours the part; leaving it alone still renders correctly, which
means the asset is right before any CSS is written.

**Effects are static-first.** Every one reads as a complete frame with nothing
animating. `fx-confetti` ships as a scattered burst with twelve individually
addressable particles (`#c1`…`#c12`) for code to animate; it is a burst before
you touch it. This is what makes `prefers-reduced-motion: reduce` leave
something meaningful on screen instead of nothing — §7.10, and an effect that
only reads as motion is an effect some children never see.

## Two things that will silently break this

**SVGO deletes the state layers.** `removeHiddenElems` treats `display="none"`
as dead weight. It removed the chest's open and locked states during production
from a file that still looked perfect. If you add an SVG optimiser to the build,
disable `removeHiddenElems`, `removeEmptyContainers` and `cleanupIds` — the
first two are the state and slot contracts, the third is the code interface.

**A palette check that greps for hex cannot see an Affinity export.** Affinity
writes `fill:rgb(36,86,166)`, so a file with no hex in it at all passes §8.5
while containing any colour at all. The delivered files are normalised to
uppercase 6-digit hex specifically so that check works; keep them that way, and
do not let an optimiser shorten `#FFFFFF` to `#fff`.

Both are covered by `assets.test.ts`.

## Rebuilding

The art is not hand-drawn: each artefact is a ~40-line program against the
Affinity SDK, so a change is an edit and a re-run. Sources live outside the repo
(`20-…` §8.2 is still open) at `Desktop\Craft-a-bot affinity\` — `scripts/` for
the programs, `src/` for the `.afdesign` documents, `raw/` for Affinity's export
before normalising.

Export preset is pinned to **`SVG (for export)`**. The `digital - high quality`
preset silently rescales a 96 × 96 document to a 300 × 300 viewBox.

## The grid, and why the backdrop is a floor

`backdrop.svg` is the only asset that hard-codes the Playroom's dimensions —
768 × 576, an 8 × 6 grid of 96 px cells, confirmed 2026-08-15. Every other file
is cell-local and survives a resize. `GRID` in `index.ts` and a test in
`assets.test.ts` are tied together, so changing one fails the other.

**The Playroom is seen from above, and the backdrop sits behind the grid at
`inset: 0`** — the artwork and the playing field are the same rectangle. Every
one of the 48 cells therefore has to be floor the bot can be sent to. The first
version of this file was drawn in elevation, with a wall and a window along the
top, and the upper rows put the bot and the blocks up the wall; it passed every
other check in this directory. `assets.test.ts` now asserts the backdrop uses
only the four floor tokens, because `--cab-board` is skirting and `--cab-sky` is
glass, and either one appearing here means a wall has been drawn on a walkable
cell.

The window is still there — as the light it throws. If you want walls and a
window as drawn objects, they need a _surround_: a separate asset on a larger
canvas with a transparent 768 × 576 hole, plus padding around `.room`. That is a
layout change as much as an art one.
