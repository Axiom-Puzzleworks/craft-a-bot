# Craft A Bot

An LLM and agent simulator built as a 1970s construction toy. Snap bricks together on a workbench — a brain, senses, memory, a tool belt, hands and wheels, a safety brick — slot in a goal card, and watch your bot think and act in a simulated playroom, with every prompt, decision and refusal visible in a flight recorder.

It exists for two reasons, in this order:

1. **An accessible training ground for agentic AI.** The teaching arc is six designed failure→fix pairs: a brain with no hands, a bot that cannot see, one that forgets, one that guesses at arithmetic, one that never learns what it was never told, and one that has to ask permission. You watch each failure happen before you fix it.
2. **A proving ground for automated AI governance.** Guardrails, human-in-the-loop approval, and a complete exportable trace are first-class parts of the toy rather than a compliance afterthought. `@craftabot/governance` is built to be liftable out and used in real agent stacks.

Everything runs in the browser. Your bots, your runs and your API key never leave it.

## Quickstart

```sh
npm install
npm run dev
```

Open the printed URL. The **Demo Brain** cartridge needs no API key — it runs scripted plans through the real engine, real world and real trace, so the whole tutorial works before you have decided whether to bring a key at all.

## Bringing your own key

Open **Settings → battery compartment**, paste an OpenAI key, and press _Insert battery_. The key is stored in this browser's `localStorage` and read only by the OpenAI pack at the moment it makes a call. It is never written into a saved bot, a trace, an export, a log or a URL — there is a test that fails if it ever is.

Use a separate, spending-capped key. The compartment links to OpenAI's key page.

## Commands

| Command                | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | Turborepo dev — core in watch mode, workbench served                 |
| `npm run demo`         | Production build of the keyless demo, ready to serve as static files |
| `npm run build`        | Build every package and the static app (checks the bundle budget)    |
| `npm run test`         | Vitest across all packages, with coverage gates                      |
| `npm run e2e`          | Playwright, entirely on the mock provider — no key needed            |
| `npm run lint`         | Prettier, ESLint and `svelte-check`                                  |
| `npm run budget`       | Report the JS bundle against the 1.5 MB budget                       |
| `npm run smoke:openai` | One real call to OpenAI. Needs a key; never runs in CI               |

## Layout

```
apps/workbench        the UI — the only place Svelte or the DOM appears
packages/core         engine, schemas, event bus, session loop
packages/governance   guardrails; depends on core and nothing else
packages/packs/starter  the Playroom: world, tools, goal cards, bricks
packages/packs/openai   the OpenAI provider
docs/design           the design documents, which are the source of truth
```

The engine is headless. `core`, `governance` and the packs never import Svelte and never touch the DOM; ESLint enforces it. Anything the UI displays comes from a typed event on the bus, which is what makes an exported trace enough to reconstruct a run.

## Status

V1.0 is feature-complete except for artwork. The interface is built from design tokens and CSS shapes standing in for the illustrated kit described in `docs/design/11-VISUAL-ASSET-MANIFEST.md`; the swap-in seams are in place but the art has not been produced, so **the `v1.0.0` tag is deliberately not cut yet**.

Also outstanding, and recorded rather than hidden:

- Two goal cards — _Tidy the blocks_ and _The locked chest_ — ask for more turns than the 30-turn engine budget allows, so they cannot currently be completed. See the dated note in `docs/design/02-AGENT-MODEL.md` §9.
- Provider errors surface friendly copy and the raw payload, but there is no automatic retry yet (`03-UI-UX-DESIGN.md` §9).

## Licence

[Apache-2.0](./LICENSE). Chosen over MIT for the express patent grant and trademark clause, with an eye to `@craftabot/governance` being released separately.
