# @craftabot/pack-starter

The content of the V1 box: the Playroom grid world, the six starter Goal Cards, and
(later) the five brick definitions and the toy tools — all contributed via a
`PackManifest` (`01-ARCHITECTURE.md` §4). See `docs/design/02-AGENT-MODEL.md`.

**Status:** WP3 — the Playroom, the six Goal Cards, and the five toy tools
(`calculator`, `dice`, `notebook_read`/`notebook_write`, `look_up_manual`) are complete
and tested. The five brick definitions join the manifest when the bench renders them (WP5).

This package also hosts the engine's end-to-end tests (`src/session/`): `core` may not
depend on a pack, so the only place the whole stack — real loop, real world, real tools,
scripted brain — can run together is here.

## Public API sketch

- `starterPack` (also the default export) — the `PackManifest`.
- `playroom` — the `WorldDefinition`; `playroom.create(layoutId)` returns a `WorldInstance`.
- `starterGoalCards` — the six `GoalCardDefinition`s.
- Internals re-exported for tests and the UI: `playroomLayouts`, `playroomActions`,
  `playroomSenses`, `playroomPredicates`, `playroomManual`/`searchManual`, and the
  `PlayroomState` types.

## The Playroom in one paragraph

An 8×6 room (`y = 0` is north) with fixed furniture — toy chest, shelf, table — plus
Teddy and whatever items a layout puts out. Turn-based, one action per turn, one item
carried at a time. **Reach equals sight:** Chebyshev distance 1, the bot's square plus
the eight around it. Illegal actions never throw and never mutate; they come back
`ok: false` with a warm explanation, because failure is a teaching moment. There is no
randomness anywhere in the world — all of it lives in the `dice` tool — so replaying an
action list always reproduces the same final state.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Any other pack, or anything beyond `@craftabot/core`'s public interfaces — packs
  contribute content, never mechanisms (`01-ARCHITECTURE.md` §4).
- Wall-clock time or `Math.random()` — both would break determinism (hard rule 5).
