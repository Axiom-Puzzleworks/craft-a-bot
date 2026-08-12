# @craftabot/pack-starter

The content of the V1 box: the five brick definitions, the toy tools, the Playroom
grid world, and the six starter Goal Cards, contributed via a `PackManifest`
(`01-ARCHITECTURE.md` §4). See `docs/design/02-AGENT-MODEL.md`.

**Status:** WP0 scaffold only — real content arrives in WP2 (`docs/design/09-ROADMAP.md`).

## Public API sketch

A `PackManifest` default export lands in WP2. Currently: `CRAFTABOT_PACK_STARTER_VERSION`.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Any other pack, or anything beyond `@craftabot/core`'s public interfaces — packs
  contribute content, never mechanisms (`01-ARCHITECTURE.md` §4).
