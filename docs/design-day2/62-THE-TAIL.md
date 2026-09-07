# 62 — The tail: art wave 2, the live checkpoints, the Python reader (WP73)

> **Status:** design of record for WP73 (`42-DAY4-ROADMAP.md` Phase Q's last row), written 2026-09-07 against the codebase after WP72 (PR #43). This is the map for `41-TARGET-DESIGN-V4.md` §6.12's last bullet (art, wave 2), §6.13's live checkpoints (G35) and §6.16 (the Python seam). Where the three differ from what is built, §8 says why and `41-…` §12 gets a dated note when the stage lands.
>
> Three unrelated things share a work package because each is small and each is the last of its kind: the **art brief** for the Workshop (`63-ART-COMMISSION-BRIEF-WAVE-2.md`, in `20-…`'s mould) with the swap-in seams proven on placeholders; the two **live checkpoints** the repo has carried as pending since Day 3, each made a one-line maintainer action; and **`examples/python-reader/`**, the proof that `docs/schemas/` is a boundary another language can stand on.

---

## 1. Purpose

`42-…`'s row, in one sentence each:

- **Art.** A commission brief an illustrator can execute without a conversation — the Playground's box, eleven instrument icons in the roundel family, the two Control Room finishes — and, in the code, the seams the art drops into, standing in as placeholders so the swap is a file copy (the WP18 pattern, `20-…` §4).
- **Checkpoints.** The Azure AI Content Safety and Gen AI evaluation checkpoints, recorded dated in `30-…` and `39-…` — taken if a key and a token exist on the machine this WP is built on, and otherwise made so cheap that whoever has them runs one command and pastes one block.
- **Python.** One script and one `requirements.txt` that read a bundle, validate it against the committed JSON Schema and recompute its digests with no code from this repo; in CI when `python3` is present.

## 2. Where the code actually is — and what the contract test found

Read before designing; each item is a fact about `main` after WP72.

1. **The seam pattern exists and is documented twice** — `lib/assets/README.md` and `lib/assets/inline.ts`: every wave 1 asset is imported `?raw`, handed out as markup from `lib/assets/index.ts` (the only place an id maps to a picture), inlined through `components/art/Art.svelte`, ids rewritten to `data-part`, baked `#state-*` layers switched by string, `--part-tint` for tintable parts. `assets.test.ts` asserts the delivery contract (palette-only colour, canvases, empty slots, no `rgb()`) over `ALL_ASSETS`. Wave 2's seams follow this exactly; nothing new is invented.
2. **The instrument components draw their finishes inline.** `Strip`, `Meter` and `Boundary` each paint graph paper with the same two `linear-gradient` rules at `16px 16px` over `--cab-graph` (`Strip.svelte` line 36, `Meter.svelte` line 105, `Boundary.svelte` line 298); `Readout`, `CaseTable`, `Chain` and `Matrix` paint metal as flat `--cab-metal`. There is no texture asset and no property a texture could arrive through. The finish seam (§4.2) is two custom properties every one of those rules reads first.
3. **Lanes and statuses carry emoji glyphs**, not icons — `dataviz.ts` `LANES` (`👀 💭 🔧 ▶ 📗 🛡 📋 ⚡ ◀ •`) and `STATUS` (`✓ ✕ ? ●`), which `44-…` §4.3 called "the roundel family's characters until WP73's icons". Those are the *trace/event* set of `11-…` §I, which wave 2 does not commission (§7); the eleven icons `42-…` names are the *instrument* set, one per Control Room instrument or screen, and they have no call site today. §4.1 gives them one.
4. **`Strip` is on seven screens** (the Bench Dashboard, Assurance, the Playground index and its four desk pages) and takes `label`, `children`, `actions?`, `testId?`. An `icon?` on `Strip` is the one prop the icon set needs to be visible somewhere; the rail, the Kit and the other instruments are untouched.
5. **The Playground's box is text** — `routes/+page.svelte` draws every shop box (`edition.shelf`, from `expansion-packs.ts`) as a heading, a line of contents and a status pill; the bot boxes beside them carry `TEMPLATES.boxSticker` through `boxArtFor`. A box template for the Playground drops in beside the bot sticker with the same `Art` call.
6. **Azure has no smoke script.** `pack-geap` has `scripts/smoke.ts` (`npm run smoke:geap`, `GEAP_*` in the environment, never in CI) and `docs/geap-setup.md`; `pack-azure-content-safety` has `validateContentSafetyKey` behind the Guard Rack's "Test the guard" and nothing a maintainer can run headless. `30-…` stage B's note says the first person with a key takes the checkpoint "from the Guard Rack in one click" — a browser step with no recorded numbers. §4.3 gives Azure the same script the other two hosted services have.
7. **The geap checkpoint is one command already** (`39-…` stage A's note: `GEAP_ACCESS_TOKEN="$(gcloud auth print-access-token)" … npm run smoke:geap`) and was blocked on an expired token and no `gcloud` on the machine. That is still the state of this machine (checked 2026-09-07: no `gcloud` on `PATH`); the checkpoint is a maintainer action, recorded as such (§4.3).
8. **`docs/schemas/` holds eight artefacts** (`packages/evals/src/json-schema.test.ts` names them) — `41-…` §6.16 lists `AssurancePack` and `BoundaryMap` too, "added to the generator's list by the WP that creates each"; WP57 and WP67 did not add them. Neither is a file that crosses a boundary today (the assurance pack is rendered, the Boundary map is derived), so this note records the gap rather than closing it (§7).
9. **A bundle's integrity is three `SHA-256`s over `JSON.stringify`** — each run's `traceDigest` over its event array, the group's over the merged stream, the bundle's over `[...runDigests, groupDigest ?? null, ...evaluationIds]` (`core/src/schemas/trace-bundle.ts`, `trace-file.ts` line 235). No canonicalisation: key order as stored, no whitespace, non-ASCII unescaped. Python's `json.dumps(value, separators=(',', ':'), ensure_ascii=False)` produces the same bytes for the JSON types a trace contains (§6 lists the one caveat), so a reader in another language can *verify* a bundle, not only parse it — a stronger proof than `41-…` §6.16 asked for.
10. **There is no committed bundle file.** The schema test builds one over `core/src/fixtures/trace-file.v2.valid.json` at test time. The Python example needs a file on disk; §4.4 commits one and ties it to the builder with a test, so it cannot drift from what the app writes.
11. **CI has no Python step**, and `ubuntu-latest` ships `python3` with `venv`. `41-…` §6.16 says "tested in CI only if `python3` is present"; §4.4's runner script decides that at run time rather than the workflow assuming it.

## 3. Principles

- **Placeholders are the seam's proof, not a sketch of the art.** A placeholder must satisfy the delivery contract in full — canvas, palette, named groups, empty slots, `--part-tint` — so that the real file replaces it with no code change, and so that `assets.test.ts` holds the contract from today rather than from delivery day. The WP18 pattern, `20-…` §4's table.
- **A finish is a property, never a rule inside a component.** The two textures arrive as CSS custom properties set once on the Workshop's root; every component that paints a finish reads the property with today's rule as its fallback. No component knows whether the art has landed.
- **An icon is never alone** (`04-…` §7, `44-…` §4.3): the roundel sits beside the strip's label, `aria-hidden`, and the label carries the meaning.
- **A checkpoint is a command and a paste.** Never a browser click the maintainer has to describe. The script prints exactly the block the doc's dated note wants and never prints the key.
- **The Python reader uses nothing from this repo but two files** — the schema and the fixture. Its `requirements.txt` is `jsonschema`. If it needed a helper from `core`, the seam would be a fiction.
- Hard rules 2 (keys), 6 (tokens), 8 (future-public) and 9 (nothing real) as ever; the placeholders draw with the palette's hex literals, as wave 1's files do, because an SVG file is not a stylesheet.

## 4. Design

### 4.1 The instrument icon seam

`lib/assets/instruments.ts`:

```ts
export const INSTRUMENT_IDS = ['meter','lamp','tape','matrix','chain','case','desk','deck','cassette','cohort','boundary'] as const;
export type InstrumentId = (typeof INSTRUMENT_IDS)[number];
export const INSTRUMENT_ICONS: Record<InstrumentId, string>; // `?raw` markup, keyed by id
```

Eleven files under `lib/assets/instruments/icon-<id>.svg`, each **96 × 96**, a disc of `fill="var(--part-tint, #3E8F8A)"` (teal — an accent, not a brick colour, `20-…` §2) with the glyph in `--cab-cream` inside an empty-by-contract `#glyph`? No: the glyph *is* the delivery, so the group is `#glyph` and carries it; what the contract fixes is the disc's id (`#disc`, tintable) and the glyph's colour. The placeholders are geometric — a needle arc, a lit disc, a ribbon, a 3 × 3 grid, three links, a folder, a counter, a stacked pair of cards, a cassette's two reels, three figures, a ring — drawn with straight paths at ≥ 2 px, so they read at 20 px and pass at 96.

`components/control-room/Roundel.svelte`: `{ icon: InstrumentId, size?: number }` → `<Art source={INSTRUMENT_ICONS[icon]} size={size ?? 20} attrs={{ 'aria-hidden': 'true' }} />` in a span with `data-testid="roundel-<icon>"`. `Strip` gains `icon?: InstrumentId` and draws the roundel before its label. The seven strips name theirs: the Bench Dashboard `desk`? No — the dashboard is the bench, and the set has no bench; it takes `meter` (its readouts are rates). Assurance `case`; the Playground index `desk`; the Advice, Fraud, Lending and Complaints desk pages `desk`, with their deck tables' strips — where a page has one — `deck`. `Lamp`, `Meter`, `Tape`, `Matrix`, `Chain`, `Boundary` and the Connector's cassette picker do not change; their icons wait for a screen that wants a roundel beside a heading, which is the brief's business (`63-…` §5.2 says where each is meant to go).

`assets.test.ts` gains the eleven under `ALL_ASSETS` with canvas 96 × 96, and one assertion of its own: every icon has a `#disc` whose fill is `var(--part-tint, …)` and a non-empty `#glyph`.

### 4.2 The finish seam

`lib/assets/finishes.ts`:

```ts
export const FINISHES = { metal, graph } as const;                    // `?raw` markup
export function finishProperties(): Record<'--cab-finish-metal' | '--cab-finish-graph', string>; // `url("data:image/svg+xml,…")` each
```

Two tileable files under `lib/assets/finishes/finish-<name>.svg`: `finish-graph` at **16 × 16** (one rule at the right edge and one at the bottom, `--cab-blue` at 6 % over transparent — today's gradient, drawn), `finish-metal` at **64 × 64** (transparent with a brushed stroke set at 4 %, over whatever `--cab-metal` the component paints). The Workshop layout (`routes/workshop/+layout.svelte`, the one place `data-mode="workshop"` is set) puts `finishProperties()` on its root as inline custom properties. Every finish rule becomes `background-image: var(--cab-finish-graph, <today's gradient>)` — `Strip`, `Meter`, `Boundary` for graph; `Readout`, `CaseTable`, `Chain`, `Matrix` gain `background-image: var(--cab-finish-metal, none)` over their `--cab-metal`. Hard rule 6 holds: the colour is still the token; the property carries a picture.

The placeholder graph reproduces today's rule, so the screenshots change by anti-aliasing at most; the placeholder metal is faint by design. Both re-baselined deliberately with §4.1's roundels in one pass (`60-…` §2 item 5's procedure for the Linux set).

### 4.3 The live checkpoints

**Azure.** `packages/packs/azure-content-safety/scripts/smoke.ts`, `npm run smoke:azure` at the root (`npm run smoke` in the pack builds first, imports `dist`), `AZURE_CONTENT_SAFETY_KEY` and `AZURE_CONTENT_SAFETY_ENDPOINT` in the environment, never in CI. Without both it prints how to get them and exits 0, as `smoke:geap` does. With them: `shieldPrompt` over `KNOWN_ATTACK` (must report `attackDetected`), `analyzeText` over a benign sentence (must parse with every category at severity 0), latency for each, and hard rule 2 checked against the live payloads — the key is nowhere in either result. It prints the dated block `30-…` stage B's note asks for. The browser half — CORS on `<resource>.cognitiveservices.azure.com` from the Guard Rack with the battery in, which decides `browserCapable` — is a click the note describes; the script says so at the end. `30-…` §7 gains the dated note (taken, or pending with the command).

**Gen AI evaluation.** Nothing new to build: `smoke:geap`'s evaluation leg is the checkpoint (`39-…` §6). Taken here if a token can be minted; recorded pending with the command otherwise, and `39-…` stage A's note amended with the date it was last attempted and what stood in the way.

**The OAuth client id, `proxy-url`, live trailing** — the rest of G35 — are recorded closed as `41-…` §6.13 records them: a maintainer action, unbuilt by decision, folded into WP68.

### 4.4 The Python reader

`examples/python-reader/`:

- `read_bundle.py` — `python3 read_bundle.py <bundle.json> [--schema docs/schemas/craftabot-bundle.schema.json]`. Loads the bundle; validates with `jsonschema.Draft202012Validator`; recomputes every run's `traceDigest`, the group's `groupDigest` when present and the `bundleDigest` exactly as §2 item 9 describes and compares; prints one line per run (id, card, outcome, events, ticks) and one verdict line; exits 1 on any mismatch. Standard library plus `jsonschema`; no other import.
- `requirements.txt` — `jsonschema>=4.18`.
- `fixtures/say-hello.craftabot-bundle.json` — the bundle `buildTraceBundle` writes over `core/src/fixtures/trace-file.v2.valid.json` with `exportedBy: 'examples/python-reader'` and `exportedAt` fixed; `packages/evals/src/python-reader.test.ts` builds it the same way and asserts the file is byte-equal, so the fixture is the app's output and never hand-edited (rule 9's sweep covers it like every other fixture).
- `README.md` — what it proves and how to run it.

`scripts/python-reader.mjs`, `npm run example:python`: finds `python3` (or `python` answering `--version` with a 3) on `PATH`; absent, prints "skipped — no python3" and exits 0; present, creates `examples/python-reader/.venv` (gitignored), installs the requirement quietly, runs the script over the fixture and a copy with one byte of an event changed (must fail), and exits with the script's status. CI's `build` job runs it after the build; the workflow assumes nothing about Python, the script decides.

## 5. UX

The Workshop gains a small teal roundel before seven strip labels and a faint brushed texture on its metal surfaces; nothing else moves. The Kit gains a box sticker on the Retail Bank Playground shop box — the `#emboss` reads "PLAYGROUND", tinted teal — and its other boxes are untouched. Nothing in the Kit's screenshots changes but that box.

## 6. Determinism

The placeholders are static files. The Python digest recomputation depends on `json.dumps` matching `JSON.stringify` byte for byte over what a trace contains: objects (key order kept), arrays, strings (both leave non-ASCII and `/` alone; both escape the same control characters and `"`, `\\`), booleans, `null`, integers, and finite floats — the one caveat is a float that JavaScript prints in exponent form (`1e21` and beyond, or below `1e-7`), which Python prints differently; no event in the corpus carries one, and the reader says which run failed if one ever does. The fixture is built with a fixed `exportedAt`.

## 7. Non-goals

- The trace/event icon set and the UI set (`11-…` §I) — the lanes keep their glyphs; a later wave.
- Bricks, cartridges, goal cards, end cards, the Kit's textures (`20-…` §6's table still stands).
- A Python port, client or evaluator (`41-…` §6.16, D2); a Python step that installs anything but `jsonschema`.
- `AssurancePack` and `BoundaryMap` schemas (§2 item 8) — recorded, not built; neither crosses a boundary as a file.
- The geap OAuth client id, `proxy-url`, harness-side live trailing (§4.3's last paragraph).
- The bench's card rack listing a desk's cards "when the box is open" (`41-…` §6.12) — the rack has been gated on a card's `audience` and the Workshop door since WP53 and WP60; there is no box to open in the Kit, and the desks' cards are behind the door. Recorded in §8.

## 8. Divergences from `41-…` and `42-…`

| Doc says | Built | Why |
|---|---|---|
| §6.12: the Playground's box art gets "`expansion-packs.ts` gaining a row with the desks' `worldId`s and the bench's card rack listing a desk's cards when the box is open" | The row exists since WP59; the rack is gated by `audience` and the door; the box gets a sticker template | The Kit has no "open box" state; the door is the gate, and `audience` already lists a desk's cards exactly when it is open |
| §6.12: "a Workshop instrument icon set … meter, lamp, tape, matrix, chain, case, desk, deck, cassette, cohort" (ten) | Eleven, with `boundary` | `42-…`'s row lists eleven; the Boundary is the Control Room's one map and has a screen of its own |
| §6.13 / `30-…` stage B: the Azure checkpoint taken "from the Guard Rack in one click" | A smoke script beside geap's; the Rack click decides only `browserCapable` | A click leaves no numbers behind; a script prints the dated block |
| §6.16: a reader that "validates with `jsonschema`" | Validates and recomputes the three digests | Verification is what a bundle is for; the digests are three lines of Python |
| §6.16: "in CI only if `python3` is present" as a workflow condition | A runner script that decides at run time | The workflow stays honest on a runner image that changes |

## 9. Risks

- **A finish placeholder shifts pixels** on every Workshop shot — accepted, one deliberate re-baseline (Windows here, Linux from CI's regeneration run as `60-…` §2 item 5 prescribes and WP72 practised).
- **`json.dumps` and `JSON.stringify` disagree** on some value in a future trace (§6's caveat) — the reader names the run; the fixture test catches it for the committed bundle.
- **`pip` refuses a system install** (PEP 668) — the runner uses a venv, never `--user` or the system site.
- **The checkpoints stay pending** — recorded so, with the one command each.

## 10. Implementation plan

- **Stage A — the seams with placeholders.** `63-…` written first. `instruments.ts` + eleven files, `Roundel`, `Strip.icon`, the seven strips; `finishes.ts` + two files, the layout's properties, the seven components' fallbacks; `brand/box-playground.svg` on the shop box; `assets.test.ts` extended; `contrast.test.ts` untouched (no new colour); screenshots re-baselined deliberately; `11-…` §I/§L and `44-…` §4.3 amended.
- **Stage B — the Python reader.** `examples/python-reader/`, the fixture and its test, `scripts/python-reader.mjs`, `npm run example:python`, the CI step, `.gitignore` for the venv; `41-…` §6.16 amended.
- **Stage C — the checkpoints and close-out.** `smoke:azure`; both smokes attempted here and recorded in `30-…` §7 and `39-…` stage A; `42-…` row and §8 items; `41-…` §12; `README.md`, `CLAUDE.md`; G35's disposition.

## 11. Acceptance

1. Every placeholder passes `assets.test.ts`'s contract; replacing any one with a file of the same name and canvas changes no code.
2. The Workshop's finishes come from two custom properties set in one place; `grep -rn "linear-gradient(rgba(36, 86, 166" components/control-room` finds only fallbacks inside `var(…, …)`.
3. `npm run example:python` validates the fixture, verifies its digests, refuses the corrupted copy, and skips cleanly with no Python; CI runs it.
4. `npm run smoke:azure` and `npm run smoke:geap` each skip cleanly without their environment and, with it, print a block the docs' notes can carry; `30-…` and `39-…` carry a dated note either way.
5. The Kit's screenshots unchanged except the Playground box; the Workshop's re-baselined once, deliberately, on both platforms.

> **Stage A landed 2026-09-07.** `63-ART-COMMISSION-BRIEF-WAVE-2.md` written first. `lib/assets/instruments.ts` (`INSTRUMENT_IDS`, `INSTRUMENT_ICONS`) over eleven placeholder roundels in `lib/assets/instruments/`; `Roundel.svelte`; `Strip.icon` on the seven strips (`tape` on the Bench Dashboard's telemetry strip, `case` on Assurance, `desk` on the Playground index and its four desk pages — the deck tables have no strip of their own, so `deck` waits for the brief). `lib/assets/finishes.ts` (`FINISHES`, `finishUrl`, `FINISH_PROPERTIES`) over two placeholder textures; the Workshop layout sets the two properties on its root; `Strip`, `Meter`, `Boundary` read `--cab-finish-graph` with their gradient as the fallback, `Readout`, `CaseTable`, `Chain`, `Matrix` read `--cab-finish-metal` over `--cab-metal`. `brand/box-playground.svg` on `TEMPLATES`; `ExpansionPack.art?` and the Retail Bank Playground row naming it; the shelf drawing it on that box, tinted teal. `wave2.test.ts` (fourteen files: canvas, palette, metadata, the tintable `#disc`/`#tint`, a drawn `#glyph`, an empty `#emboss`, the `url()` properties) and a `Strip` case in `instruments.svelte.test.ts`. **One risk in §9 did not materialise:** the Workshop screenshots are unchanged — `playwright.config.ts` allows `maxDiffPixelRatio: 0.01`, and a 20-px roundel plus a 6 %-opacity rule moved by half a pixel is under one per cent of a full-page shot; only the Kit's shelf (a 48-px box art) re-baselined, on Windows here and on Linux from CI's regeneration run. The seven strips were checked by eye in the browser instead. `11-…` §I and §L, `44-…` §4.3 amended.
>
> **Stage B landed 2026-09-07.** `examples/python-reader/` — `read_bundle.py` (validates with `jsonschema` Draft 2020-12, recomputes the three digests with `hashlib` and `json.dumps(…, separators=(',', ':'), ensure_ascii=False)`, prints a line per run and a verdict, exit 1 on any mismatch), `requirements.txt` (`jsonschema>=4.18`), `README.md`, `fixtures/say-hello.craftabot-bundle.json` — the bundle `buildTraceBundle` writes over the starter's say-hello golden trace (65 events) with a provisional record given the golden's card and the starter's spec, `exportedAt` fixed. `evals/src/python-reader.test.ts` rebuilds it the same way and holds the file byte-equal. `scripts/python-reader.mjs` / `npm run example:python`: finds a Python 3, makes the example's venv (gitignored), installs the requirement, reads the fixture (passes: every digest matched) and a copy with one event's tick changed (fails on `traceDigest`, as it must); skips with exit 0 when no Python is on `PATH`. CI's `build` job runs it after the build. The synthetic sweep's roots gained `examples/` (and `.venv` its skip list). `41-…` §6.16 amended. §6's caveat held: not one of the sixty-five events needed a byte the two serialisers disagree on.
>
> **Stage C landed 2026-09-07 — WP73 closed.** `smoke:azure` (`packages/packs/azure-content-safety/scripts/smoke.ts`, `npm run smoke` in the pack building first): both wire shapes over a live resource, the latencies, the dated line for `30-…`'s note, the key checked absent; skips cleanly without its two variables. **Both checkpoints attempted on this machine and still pending**, recorded dated in `30-…` §7 (no Azure resource) and `39-…` stage A (`bad-token` — the stored Google token had expired again, no `gcloud` to mint one); each is one command and a paste for whoever has the credential. G35's remainder as `41-…` §6.13 disposes it. Close-out: `42-…` §3 and §8 items 65–67, `41-…` §12, `README.md`, `CLAUDE.md`. Gate: root lint, every workspace's tests, the build with the budget and schema checks, the evals baseline, the default e2e, the visual project.
