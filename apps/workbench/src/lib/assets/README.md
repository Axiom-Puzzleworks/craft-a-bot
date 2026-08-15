# `lib/assets` — wave 1 art

The 28 artefacts commissioned in `docs/design-day2/20-ART-COMMISSION-BRIEF.md`
§5, delivered 2026-08-15. What they are and why they look like that is in
`21-ART-PRODUCTION-PLAN.md` and `22-WAVE-1-HANDOVER.md`. This file is the part
you need in order to _use_ them.

## Draw them with `<Art>`, look them up through `index.ts`

```svelte
<script lang="ts">
	import { SCENE_ITEMS } from '$lib/assets/index.js';
	import Art from '$lib/components/art/Art.svelte';
</script>

<span class="item"><Art source={SCENE_ITEMS['block-a']} /></span>

<style>
	/* Scoped styles never cross an `{@html}` boundary — `:global` is required. */
	.item :global(svg) {
		width: 100%;
		height: 100%;
	}
</style>
```

Everything is imported `?raw` and handed out as markup rather than as a URL.
That is not a preference. §3's contract is built on named groups —
`#face-slot`, `#icon-slot`, `#state-*`, `#emboss` — and on `--part-tint`, and
none of those can be reached through an `<img src>`. Inline, or the contract is
decoration.

**`Art` is the only thing that should call `{@html}` on an asset**, and
`inline.ts` is where the markup is prepared. Nothing that came from a kit file,
a trace, a goal card or a child's typing may be passed to either.

`index.ts` is also **the only place a world id may be mapped to a picture.** The
filenames carry an `item-` prefix that the world's ids do not, so a second
mapping is exactly the kind of thing that drifts. It has drifted here before: on
2026-08-12 the grid drew the blue A block as a "C" while the trace called it "a
blue letter block (A)". `assets.test.ts` asserts this mapping against the world
the pack actually builds, across every layout.

## Ids on disk, `data-part` on the page

**The delivered ids do not reach the document.** `inline.ts` rewrites every
`id="x"` to `data-part="x"`. A shelf of six bots inlines six `box-sticker`s and
the badge sheet inlines seven rosettes, so keeping them would mean seven
elements called `#emboss` in one page — invalid, and invalid in the way that
bites later, through a `getElementById` or an `aria-labelledby` that resolves to
somebody else's badge.

Nothing is lost. **No wave 1 file refers to one of its own ids** — no gradient,
no clip path, no `<use>` — and `inline.ts` throws rather than assuming that,
because such a file would render _almost_ right after the rename. So a test
still asks for `[data-part="state-open"]`, and it can ask a page with twenty
rosettes on it.

## The four mechanisms

**Faces mount into a pose.** `BOT_FACES[expression]` is the _contents_ of
`#face-slot` — 48 × 48, no background, not a whole bot. Both poses put the slot
at the same origin (`SLOT_ORIGINS['face-slot']`, stamped into the files as a
`transform`), so swapping pose does not move the face. Pass it as a slot and
the nesting takes care of the coordinates:

```ts
inlineSvg(BOT_POSES.walk, { slots: { 'face-slot': inlineSvg(face, { size: 48 }) } });
```

**States are baked layers, chosen by the app.** `toy-chest.svg` is one file
carrying `#state-closed`, `#state-open` and `#state-locked`; the last two ship
`display="none"`. Which one paints is a `variants` option, not a stylesheet:

```svelte
<Art source={CONTAINERS['toy-chest']} variants={{ state: container.state }} />
```

Same mechanism for `fx-sparkle` (`#frame-1/2/3`) and `badge-rosette`
(`#state-earned`, where "unearned" is choosing a layer that does not exist).
CSS could do this, but only by enumerating every state in a `:global` block —
a component's styles reaching into markup it did not write.

**Tintable parts take a CSS custom property.** `#tint` on `cell-highlight`,
`box-sticker` and `badge-rosette` is `fill="var(--part-tint, #TOKEN)"`. Setting
the property recolours the part; leaving it alone still renders correctly, which
means the asset is right before any CSS is written.

**Effects are static-first.** Every one reads as a complete frame with nothing
animating. `fx-confetti` ships as a scattered burst with twelve individually
addressable particles (`#c1`…`#c12`) for code to animate; it is a burst before
you touch it. This is what makes `prefers-reduced-motion: reduce` leave
something meaningful on screen instead of nothing — §7.10, and an effect that
only reads as motion is an effect some children never see. When to draw which
is `lib/fx-cue.ts`, and what it looks like moving is `components/play/Fx.svelte`.

## Two things that will silently break this

**SVGO deletes the state layers.** `removeHiddenElems` treats `display="none"`
as dead weight. It removed the chest's open and locked states during production
from a file that still looked perfect. If you add an SVG optimiser to the build,
disable `removeHiddenElems`, `removeEmptyContainers` and `cleanupIds` — the
first two are the state and slot contracts, the third is the code interface.
(`cleanupIds` would also give `inline.ts` nothing to rename, so the whole
`data-part` interface would quietly become empty attributes.)

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

## The grid

`backdrop.svg` is the only asset that hard-codes the Playroom's dimensions —
768 × 576, an 8 × 6 grid of 96 px cells, confirmed 2026-08-15. Every other file
is cell-local and survives a resize. `GRID` in `index.ts` and a test in
`assets.test.ts` are tied together, so changing one fails the other.
