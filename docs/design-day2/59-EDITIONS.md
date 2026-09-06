# 59 — Editions and the site (WP69)

> **Status:** design of record for WP69 (Phase P; `42-DAY4-ROADMAP.md` §3, `41-TARGET-DESIGN-V4.md` §6.14, decision D3; retires G40 and G42). Written 2026-09-06 on branch `wp69-editions`, before stage A.

## 1. Purpose

One codebase, three sections of a site. The Kit is a child's training ground; the Workshop is a practitioner's bench; the Playground is a regulated desk with synthetic customers. Today they are one build with a door between them (`preferences.workshop`) and one pack list. Publishing them means a visitor to `/simulator` never downloads the desks, a visitor to `/workshop` never sees the Playground's rack, and whoever hosts `/playground` can put a login in front of the folder without the app knowing (D3). `41-…` §6.14 fixes the shape: **an edition decided at build time and nothing at run time** — the default edition is the app exactly as it is, every existing test runs against it, and the three editions are additional artefacts.

## 2. Where the code actually is — and what the contract test found

Read before writing: `apps/workbench/vite.config.ts` (the SvelteKit config lives inside it; `adapter-static` with the `index.html` fallback; `envDir` at the root), `src/service-worker.ts`, `routes/+layout.svelte` and `routes/workshop/+layout.svelte`, `lib/packs.ts`, `lib/expansion-packs.ts` and the shelf (`routes/+page.svelte`), `routes/settings/+page.svelte` (the door), `lib/state/preferences.svelte.ts`, `lib/state/agents.svelte.ts` (the import) and `core`'s `importKitFile`, `scripts/bundle-budget.mjs`, `playwright.config.ts`, `e2e/support.ts`, `.github/workflows/ci.yml`, `.env.example`.

1. **Every link already goes through `resolve()`.** Thirty-one files import `$app/paths` and a sweep finds no raw `href="/…"` or `goto('/…')` in `src`. **Reused:** `kit.paths.base` per edition is the one SvelteKit setting touched, and links follow it for free.
2. **Route detection reads `page.url.pathname` with the base in it.** The root layout (`routeOf`, `inKit`, the leaflet's route) and the Workshop layout's rail mapping test `pathname.startsWith('/workshop…')`; under `base = '/workshop'` the pathname is `/workshop/workshop/runs` and every test misfires. **Fixed:** one helper, `routePath(pathname)` in `lib/edition.ts`, strips `base`; every check reads it.
3. **The service worker's fallback is `'/'`.** `SHELL` lists `'/'` and the navigation fallback matches `'/'`; under a base that document does not exist. **Fixed:** `$service-worker`'s `base` — the fallback is `${base}/`.
4. **`CAB_EDITION` is not a Vite variable.** Vite exposes `VITE_*` only; `import.meta.env.CAB_EDITION` would be `undefined` at build. **Fixed:** `envPrefix: ['VITE_', 'CAB_']` in `vite.config.ts`, so the name `41-…` gives works and nothing else of the environment leaks into the bundle.
5. **The budget script measures `<app>/build`.** `bundle-budget.mjs` has `--app` and `--limit` (WP56) but the output directory is fixed. **Fixed:** `--out <dir>` (relative to the app), so `build/<edition>/` is measured against its own limit while the per-route table still reads the manifests SvelteKit wrote for that build.
6. **`vite preview` has one SPA fallback.** A static host needs a rewrite per folder (`/simulator/*` → `/simulator/index.html`); `vite preview` rewrites to the root `index.html` only, so a deep link into an edition's folder under preview lands in the `full` build. **Decided:** the smoke specs enter at each folder's root and navigate inside the app (the e2e's own discipline), and `docs/publishing.md` gives the rewrite rule per host. Deep links work on a host that has the rule, which is every static host worth the name.
7. **The Workshop door is a preference with a default of `false`.** In the `simulator` edition the Workshop is not in the box, so the rocker would open a door onto nothing; in the `workshop` and `playground` editions the door should start open. **Fixed:** `edition.mode` seeds the preference's default (`'workshop'` → open) and, in an edition with no Workshop, Settings renders a link to the section that has it instead of the rocker (`41-…` §6.14's proof).
8. **`importKitFile` already names the missing packs.** `missing-packs` carries `missing: string[]` and a message; the design asks for "which edition has them". **Decided:** the message is widened in the app, not `core` — `editionWithPacks(missing)` names the section and its path (`/playground`) and `core`'s contract stays as it is; `41-…`'s "the `version-mismatch` path, one message wider" is the `missing-packs` path, recorded in §8.
9. **The Workshop's URL under its own base reads `/workshop/workshop/…`.** Routes are file-based; the Workshop's screens live under `routes/workshop/`. **Decided:** accepted — the section is `/workshop` and the app's own paths sit beneath it; the alternative (a route alias per screen) is not worth its weight for a URL a visitor reaches by clicking. Recorded in §8.

## 3. Principles

- **Build time, never run time.** `edition.ts` reads one variable once; the bundle for an edition contains only that edition's packs and pages. No edition check reads `localStorage`, a query string or a hostname.
- **`full` is today's app, byte for byte.** `npm run build`, `npm run dev`, every test and CI's default job use it. Nothing changes for a developer.
- **Additive artefacts.** `npm run build:editions` writes three more folders beside the one that exists; each is a plain folder for a static host with its own budget.
- **Honest boxes.** A shelf row for a pack that lives in another section says so and links there; a kit file that needs a pack from another section says which section; a route not in the box says which box has it. Nothing pretends.
- **Keys per origin, as before.** Sections on one host share an origin and therefore `localStorage`; a visitor's vault is theirs across sections. A host that wants otherwise puts sections on subdomains — `docs/publishing.md` says so.
- **A login is a hosting rule** (D3): in front of a folder, never in the app.

## 4. Design

### 4.1 `lib/edition.ts`

```ts
export type EditionId = 'simulator' | 'workshop' | 'playground' | 'full';
export interface Edition {
  id: EditionId;
  title: string;           // "Craft A Bot", "The Workshop", "Retail Financial Services Playground", "Craft A Bot"
  base: string;            // '/simulator', '/workshop', '/playground', ''
  packs: PackManifest[];   // the explicit list, per edition
  routes: { allow: RegExp[] };  // over the route path with the base stripped
  mode: 'kit' | 'workshop';
  shelf: ExpansionPack[];  // EXPANSION_PACKS with `in-another-edition` rows and a link
  budgetBytes: number;
}
export const EDITIONS: Record<EditionId, Edition>;
export const edition: Edition;               // from import.meta.env.CAB_EDITION, 'full' by default
export function routePath(pathname: string): string;   // the pathname with `base` stripped
export function sectionFor(routePath: string): Edition | undefined;  // the smallest edition that allows it
export function editionWithPacks(packIds: string[]): Edition | undefined;
```

The pack lists: **simulator** — `starter`, `openai`, `personas`, `anthropic`, `gemini`, `ollama`, `monitor`, `workshop` (the Explorer's World), the demo pack; **workshop** — the simulator's plus `geap`, `guard-local`, `azure-content-safety`, `pdp-opa`, `evaluators`, `evidence` and the generic control map; **playground** — the workshop's plus `fs-bank`, `fs-advice`, `fs-fraud`, `fs-lending`; **full** — the playground's (today's list, in today's order). The route allow-lists: simulator — everything outside `/workshop`; workshop — everything outside `/workshop/playground`; playground and full — everything. `packs.ts` becomes `edition.packs`; `installedPacks` keeps its name as that alias so nothing else moves.

### 4.2 The build

`vite.config.ts` reads `process.env.CAB_EDITION` (the same value the bundle reads through `envPrefix`) to set `kit.paths.base` and the adapter's `pages`/`assets` to `build/<edition>` for a named edition, `build` for `full`. `npm run build:editions` (`scripts/build-editions.mjs`) builds the three in turn, each followed by `bundle-budget.mjs --out build/<edition> --limit <edition.budgetBytes>`, and prints one line per edition. The budgets: `full` keeps 1,465 kB; the others are set from their first measured size with the same headroom `full` has (recorded in the stage A note). The service worker scopes to `base` (item 3).

### 4.3 The guard and the shelf

The root layout compares `routePath(page.url.pathname)` against `edition.routes.allow`; a route not allowed renders `NotInThisBox.svelte` — the edition's own page: *"This is not in this box"*, the section that has it as a link to `${section.base}/` on the same host, and a link back to this section's shelf. The Kit's shelf renders `edition.shelf`: the Retail Bank Playground row reads *In the Playground* and links to `/playground/` in the `simulator` and `workshop` editions; the Explorer's World stays *Unlocked!* everywhere (the world pack is in every box). The `simulator` edition's Settings shows *The Workshop is in another box* with a link in place of the rocker; the nav header's door follows the preference as today.

### 4.4 Kit files across sections

A kit file exported from the Playground carries `requires.packs` naming `fs-advice`; imported into the Simulator, `importKitFile` returns `missing-packs`; the app's message becomes *"This bot uses parts from the Playground (fs-advice) — open /playground to build it there."* A trace file imports anywhere (a trace names packs but needs none of them to be read).

### 4.5 The smoke specs and CI

`playwright.editions.config.ts`: one `webServer` (`npm run build:editions && npm run preview`), three projects — `simulator`, `workshop`, `playground` — each with `baseURL` at its folder and `testMatch` on `e2e/editions/<edition>.spec.ts`; the default config ignores `e2e/editions/`. The smoke specs enter at the folder root and navigate: the Simulator's first run (new bot, build, GO, an end card) with the leak gate (a fitted key appears nowhere on the page or in a download); the Workshop's Run Lab (a run played, opened in the Run Lab); the Playground's Advice Desk (the Playground page, the Advice Desk's case). A fourth check per edition: a route outside the allow-list renders the edition's page. CI gains an `editions` job: `build:editions` (the three budgets), `e2e:editions`, and the three folders uploaded as one artefact.

### 4.6 `docs/publishing.md`

How the three folders map to `/simulator`, `/workshop` and `/playground` on a static host; the per-folder SPA rewrite; where a login sits (in front of `/playground`, a hosting rule); the origin note on keys; that `full` remains what `npm run preview` serves.

## 5. UX

The Kit does not change by a pixel in `full`. In an edition, the only visible differences are the shelf's *In the Playground* sticker, the Settings door as a link, and the not-in-this-box page — each a plain statement with a link, in the Kit's own voice. Toy names in the UI (*box*, *shelf*, *door*); `edition`, `base`, `packs` in code.

## 6. Determinism

An edition is a constant in the bundle. The same source and the same `CAB_EDITION` produce the same folder; `full` produces today's folder. No run, trace or campaign carries the edition — a run made in one section is the same run in another.

## 7. Non-goals

No run-time edition switch; no login in the app; no per-section storage split; no separate repos or branches per edition; no build of the harness per edition (the harness is one host with every pack, as today).

## 8. Divergences

| Doc says | Built | Why |
|---|---|---|
| `41-…` §6.14: `importKitFile`'s "`version-mismatch` path, one message wider" | The `missing-packs` message widened in the app (`editionWithPacks`); `core` unchanged | A pack from another section is missing, not mismatched; the contract already names the missing ids (§2 item 8) |
| §6.14: "the key-leak test runs over all three folders" | The Simulator smoke spec carries the leak gate through the UI; the harness's leak sweep is unchanged | The built folders hold no key by construction; the gate that can fail is the one through the UI (`battery.spec.ts`'s), run under the edition's base |
| §6.14: the Workshop's section at `/workshop` | Its screens sit at `/workshop/workshop/…` | File-based routes; a route alias per screen is not worth its weight (§2 item 9) |

## 9. Risks

- **A raw path slips in later** and breaks under a base. The three smoke specs run under a base in CI; the default suite never will.
- **`vite preview`'s single fallback** hides a deep-link problem a host would show. `docs/publishing.md`'s rewrite rule is the fix; the smoke specs do not rely on deep links.
- **Budgets drift**: an edition's budget is a number in `edition.ts`; the editions job fails when one is crossed, as `full`'s does.

## 10. Implementation plan

- **Stage A** — `edition.ts`, `envPrefix`, `base` and the output folder from the edition, `routePath` in both layouts, the service worker's base, `packs.ts` on `edition.packs`, the preference default from `edition.mode`, the route guard and `NotInThisBox`, `--out` on the budget script, `build:editions` with the three budgets.
- **Stage B** — the shelf's `in-another-edition` rows, Settings' door as a link, the import message naming the section, unit tests.
- **Stage C** — `playwright.editions.config.ts`, the three smoke specs with the leak gate, the CI job with the upload, `docs/publishing.md`, close-out.

## 11. Acceptance

1. `npm run build` produces the same `full` folder as before this WP (the budget line unchanged; every default e2e and the visual set green).
2. `npm run build:editions` writes `build/simulator`, `build/workshop`, `build/playground`, each within its budget, in CI, and uploads them.
3. Each smoke spec passes under its base: the Kit's first run with the leak gate; the Workshop's Run Lab; the Playground's Advice Desk.
4. A route outside an edition's allow-list renders the edition's page with a link to the section that has it.
5. The `simulator` edition's Workshop door is a link, not a toggle; the `workshop` and `playground` editions start with the door open.
6. A Playground kit file imported into the Simulator says which section has its packs.

> **Stage A landed 2026-09-06.** `lib/edition-id.ts` (the id and mode from `CAB_EDITION`, the pack ids per box — no pack imports, so `settings.ts` can seed the door's default from it) and `lib/edition.ts` (the `Edition` record per box, `edition` for the built one, `routePath`, `allowsRoute`, `sectionFor`, `editionWithPacks`); `lib/editions/<id>.ts` — one module per box listing its packs, aliased as `$edition-packs` from `vite.config.ts` so a bundle's module graph carries only its own packs (a first cut kept every pack behind a record and every edition measured the same 1,381 kB — the alias is what makes the exclusion the bundler's); `packs.ts` on `edition.packs`; `envPrefix` for `CAB_`, `paths.base` and the adapter's folder from the edition; the service worker's `${base}/`; `routePath` in both layouts; the root layout's guard rendering `NotInThisBox.svelte`; `data-edition` on the document; `--out` on the budget script; `scripts/build-editions.mjs` and `npm run build:editions`; the default Playwright project ignoring `e2e/editions/`. Measured: `full` 1,381 kB (unchanged), `simulator` 1,348 kB, `workshop` 1,367 kB, `playground` 1,381 kB — the folders differ by their pack graphs only, since SvelteKit builds every route's chunk into every edition (lazy, and never fetched behind the guard); the budgets are set with `full`'s headroom: 1,396 / 1,416 / 1,431 / 1,465 kB. One catch: Playwright loads the e2e helpers under plain Node, where `import.meta.env` is absent — the read is guarded and falls back to `full`. Gate: root lint, the workbench's tests, `full` built byte-for-byte within its budget, the three editions within theirs, the default e2e (190) and the visual set.
>
> **Stage B landed 2026-09-06.** The shelf renders `edition.shelf`: the Retail Bank Playground's box reads *In the Playground →* and links to `/playground/` in the `simulator` and `workshop` editions (`ExpansionPack.status` gains `in-another-edition` with an `href`); Settings renders the door as a link to the section that has it (*The Workshop … is in another box: open The Workshop*) where `/workshop` is not in the box, the rocker otherwise; the agents store widens `importKitFile`'s `missing-packs` message to name the section and its path when every missing pack lives in one (`editionWithPacks`), `core` untouched. `edition.test.ts`: the test build is `full` with exactly the table's pack ids (the table had `evaluators` for a pack whose id is `evals` — the test is what the table is for), `routePath` under a base, the three allow-lists, `sectionFor`/`editionWithPacks`, the shelf rows and the modes. Gate: root lint, the workbench's tests, the default e2e and the visual set (nothing changes under `full`).
