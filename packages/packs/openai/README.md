# @craftabot/pack-openai

OpenAI model cartridges: SSE streaming chat, tool calling, three cartridges + catalogue
file, key validation ping, error normalisation. Deliberately separate from `pack-starter`
to prove the cartridge/expansion mechanism and template every future LLM pack
(`01-ARCHITECTURE.md` §2). See `docs/design/06-LLM-PROVIDERS.md`.

**Status:** WP0 scaffold only — real content arrives in WP7 (`docs/design/09-ROADMAP.md`).

## Public API sketch

A `PackManifest` default export with `cartridges` lands in WP7. Currently:
`CRAFTABOT_PACK_OPENAI_VERSION`.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Any other pack, or anything beyond `@craftabot/core`'s public interfaces.
- An API key ever leaving this pack's own call site — keys are read only at call time,
  never logged, stored elsewhere, or included in events (`06-LLM-PROVIDERS.md` §6).
