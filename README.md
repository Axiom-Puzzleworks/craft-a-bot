# Craft A Bot

An LLM and agent simulator built as a 1970s construction toy.

You snap bricks together on a workbench — a brain, eyes and ears, a scrapbook, a tool belt, hands and wheels, a safety brick — slot in a goal card, and pull the GO lever. Your bot then tries to achieve the goal in a simulated playroom, one turn at a time, while a flight recorder shows you every prompt it was sent, every decision it made, every tool it reached for and every rule that stopped it.

Everything runs in your browser. Your bots, your runs and your API key never leave it.

> **No screenshots yet.** The interface is currently drawn with CSS placeholders while the artwork is in production — see [Status and known gaps](#status-and-known-gaps).

---

## What it is for

**1. Learning how agents actually work.** Most explanations of "AI agents" are diagrams. This is a thing you can take apart. The tutorial is six designed failure→fix pairs — you are shown the failure _first_, then you fix it:

| Chapter | You watch it go wrong                          | You fix it by                     | The real idea                                     |
| ------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| 1       | The bot thinks beautifully and nothing happens | Adding the Hands & Wheels brick   | What an agent loop is                             |
| 2       | It acts, but greets an empty corner            | Adding the Eyes & Ears brick      | Observations — a model only knows what it is told |
| 3       | It has the same good idea over and over        | Adding the Scrapbook brick        | Why memory matters                                |
| 4       | It says 17 × 23 = 371, confidently             | Switching on the calculator       | Hallucination, and tools as the cure              |
| 5       | It shoves a locked lid, repeatedly             | Switching on "look up the manual" | Retrieval                                         |
| 6       | It changes the world without asking            | Switching on approval mode        | Guardrails and human oversight                    |

**2. Prototyping AI governance.** Guardrails, approval flows and a complete, exportable, tamper-evident trace are first-class parts of the toy rather than a compliance afterthought. The `@craftabot/governance` package depends only on the engine core and is built to be lifted out and used in real agent stacks.

---

## Installing

### What you need first

|             | Version                          | Notes                                                                                                                                                                            |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js** | **20 or newer** (24 recommended) | The only hard requirement. Get it from [nodejs.org](https://nodejs.org) or via [nvm](https://github.com/nvm-sh/nvm) / [nvm-windows](https://github.com/coreybutler/nvm-windows). |
| **npm**     | 10 or newer                      | Ships with Node. This repo is pinned to `npm@11.19.0` via `packageManager`.                                                                                                      |
| **Git**     | any recent                       | To clone the repo.                                                                                                                                                               |

Check what you have:

```sh
node --version   # must be >= v20
npm --version
```

You do **not** need to install Svelte, SvelteKit, TypeScript, Vite, Turborepo, Vitest or Playwright separately — they are all dependencies of this project and arrive with the install step below. There is no database, no server and no cloud account to set up.

### Install

```sh
git clone https://github.com/<your-org>/craft-a-bot.git
cd craft-a-bot
npm install
```

`npm install` installs every workspace at once (this is an npm-workspaces monorepo), which takes a couple of minutes the first time.

If you plan to run the browser tests, fetch the browsers too — this is optional and not needed to use the app:

```sh
npx playwright install
```

---

## Running it

### Development

```sh
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). The dev server hot-reloads as you edit.

### A production build, served locally

This is the pair you want to check the real, optimised app:

```sh
npm run build     # builds every package and the static site
npm run preview   # serves the built site
```

`npm run build` writes the finished static site to `apps/workbench/build/`. It is a plain folder of HTML, JS and CSS with no server component — you can host it on GitHub Pages, Netlify, Cloudflare Pages, S3, or any static host by uploading that folder.

`npm run preview` serves exactly those built files locally, so what you see is what a visitor would get.

### Every command

| Command                | What it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run dev`          | Dev server with hot reload                                             |
| `npm run build`        | Build all packages and the static site (also checks the bundle budget) |
| `npm run preview`      | Serve the production build locally                                     |
| `npm run demo`         | Build the keyless demo, ready to drop on a static host                 |
| `npm run test`         | Unit tests across all packages, with coverage gates                    |
| `npm run e2e`          | Browser tests — runs entirely on the mock provider, no API key needed  |
| `npm run lint`         | Prettier, ESLint and `svelte-check`                                    |
| `npm run budget`       | Report the JS bundle size against the 1.5 MB budget                    |
| `npm run smoke:openai` | One real call to OpenAI. Needs a key; never runs in CI                 |

---

## Using it

### Your first bot — no API key required

The **Demo Brain** cartridge needs no key at all. It runs scripted plans through the _real_ engine, the _real_ world and the _real_ trace, so everything except the model's intelligence is genuine. The whole tutorial works on it.

1. Open the app. The instruction leaflet opens on its own the first time — it points at the real interface as you go, and you can dismiss it with **"I've built kits before"** or reopen it any time from the **Instructions** handle.
2. Press **New bot** on the shelf.
3. Drag the **Brain Brick** onto the head socket — or use the keyboard: focus a brick in the tray, press <kbd>Enter</kbd>, use <kbd>↑</kbd>/<kbd>↓</kbd> to pick a socket, <kbd>Enter</kbd> again to fit it. The whole workbench is keyboard-operable.
4. Click the fitted brick to open its panel and choose the **Demo Brain** cartridge.
5. Pick a goal card from the rack — start with **Say Hello!**
6. Pull the **GO** lever, then press **STEP** to advance one turn at a time, or **PLAY** to let it run.

Watch the thought bubble for what the bot is thinking and the **Flight Recorder** at the bottom for what actually happened. Click any row to see the exact data behind it — including the full prompt that was sent.

### The bricks

| Brick              | Gives the bot                            | Really is                                                       |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------- |
| **Brain**          | Something to think with                  | The LLM, plus temperature and token settings                    |
| **Eyes & Ears**    | Awareness of the room                    | The observation channels written into each prompt               |
| **Scrapbook**      | Memory of recent turns                   | The rolling context window, and an optional notebook            |
| **Tool Belt**      | A calculator, dice, a notebook, a manual | Tool-calling, via the provider's real tool API                  |
| **Hands & Wheels** | The ability to change things             | World actions — the ones with consequences                      |
| **Safety**         | Limits, blocked actions, approval        | Guardrails: step budgets, capability scoping, human-in-the-loop |

### The goal cards

**Say Hello!** · **Help the teddy get a snack** · **Sums for Teddy** (17 × 23) · **Tidy the blocks** · **The locked chest** · **Free play**, where you write your own goal on the card.

### Bringing your own OpenAI key

Optional — only needed if you want a real model instead of the scripted demo.

1. Go to **Settings → battery compartment**.
2. Paste an OpenAI API key and press **Insert battery**. The meter lights once the key is verified.
3. Back on the bench, choose a real cartridge in the Brain panel: **Quick Thinker**, **Deep Thinker** or **Penny Thinker**.

**Where your key goes.** It is stored in this browser's `localStorage` and read only by the OpenAI pack at the moment it makes a call, which goes directly from your browser to `api.openai.com`. It is never written into a saved bot, a trace, an export, a log, an error message or a URL. There is a CI test that fails the build if it ever is. Press **Eject** to remove it.

Use a separate, spending-capped key — the compartment links to OpenAI's key page. Runs cost a fraction of a penny.

### Sharing what you built

- **Export kit** saves a bot as a `.craftabot-kit.json` file you can send to someone else. Keys are never included.
- **Export trace** saves a complete run — every event, with a SHA-256 digest so a recipient can verify it has not been altered.

---

## Project layout

```
apps/workbench            the UI — the only place Svelte or the DOM appears
packages/core             engine, schemas, event bus, the tick loop
packages/governance       guardrails; depends on core and nothing else
packages/packs/starter    the Playroom: world, tools, goal cards, bricks
packages/packs/openai     the OpenAI provider
docs/design               the design documents, which are the source of truth
```

Two rules shape the codebase. The engine is **headless** — `core`, `governance` and the packs never import Svelte and never touch the DOM, and ESLint enforces it. And everything the UI shows comes from a **typed event** on the bus, which is what makes an exported trace enough to reconstruct a run.

If you want to understand the design rather than the code, start with `docs/design/00-PROJECT-OVERVIEW.md`.

---

## Status and known gaps

V1.0 is feature-complete **except for artwork**. The interface is built from design tokens and CSS shapes standing in for the illustrated kit described in `docs/design/11-VISUAL-ASSET-MANIFEST.md`. The swap-in seams are in place, but the art has not been produced — so the `v1.0.0` tag has deliberately not been cut.

Recorded rather than hidden:

- Two goal cards — **Tidy the blocks** and **The locked chest** — need more turns than the 30-turn engine budget allows, so they cannot currently be completed. See the dated note in `docs/design/02-AGENT-MODEL.md` §9.
- Provider errors show friendly copy with the raw payload one click away, but there is no automatic retry yet.
- Sound cues are synthesised rather than recorded; `apps/workbench/src/lib/sound.ts` is the seam if you want to swap in samples.

Measured against the targets in `docs/design/01-ARCHITECTURE.md` §8: **314 kB of JavaScript** (110 kB gzipped) against a 1.5 MB budget, WCAG 2.1 AA contrast enforced by a test that parses the design tokens, full keyboard operation, and an app shell that loads offline.

## Contributing

Read `CLAUDE.md` first — it lists the hard rules — then `docs/design/10-CODING-STANDARDS.md`. The design documents are the source of truth: if an implementation has to diverge from one, the document gets a dated note in the same change.

Before opening a pull request:

```sh
npm run lint && npm run test && npm run build && npm run e2e
```

## Licence

[Apache-2.0](./LICENSE) — chosen over MIT for the express patent grant and trademark clause, with an eye to `@craftabot/governance` being released separately.
