# 38 — `@craftabot/governance` 1.0 (WP50)

> **Status:** design of record for WP50 (`27-DAY3-ROADMAP.md` Phase L's first row), written 2026-09-03 against the codebase after WP49. This is the map for `26-TARGET-DESIGN-V3.md` §6.15's first sentence and `08-GOVERNANCE-GUARDRAILS.md` §5's last row and §6's promised mapping; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

`08-…` §5's growth path ends in one row: `@craftabot/governance` "published as a standalone library … usable in real agent stacks". The package has kept that boundary since day one (ESLint holds it to `core`, `08-…` §7.4 makes it an acceptance criterion) and has grown every mechanism the row names — the six rules, the policy-card compiler, the hosted-guardrail shell, the PDP input document, the reports — but nothing has ever tried to *use* it outside this repo, its README still says "WP0 scaffold", its version is `0.0.1`, and `08-…` §6's `docs/governance-mapping.md` was never written. WP50 does the four things that turn a boundary into a library: a real README with TSDoc on every export, one integration with no Craft A Bot world in it, the mapping document, and a release candidate whose tarball is proven to contain nothing but the library.

---

## 2. Where the code actually is

**`packages/governance/`** — `package.json` (`private: true`, `0.0.1`, exports `.` and `./reports`, `build`/`test`/`check`), `README.md` (WP0's placeholder), `src/index.ts` (the main barrel: six `create*Guardrail` factories and their ids, `compilePolicyCard`/`evaluatePredicate`/`predicateContextFor`, the hosted shell — `createHostedGuardrails`, config, selectors, strings, verdict mapping — `assertionEvaluator` and friends, `pdpRequestFor`, `CRAFTABOT_GOVERNANCE_VERSION`), `src/reports/index.ts` (the folds: summaries, incidents, the safety case, telemetry, drift, the safety tally), `tsconfig.build.json` (excludes tests and `test-context.ts`), `vitest.config.ts` (100% on `guardrails/*`, `spec-guardrails.ts`, `hosted/*`). **`core`** — `Guardrail`, `GuardrailContext`, `GuardrailVerdict`, `runGuardrailChain(guardrails, hook, ctx, onChecked)`, `GuardrailService`/`GuardrailServiceClient`/`ScreenRequest`/`ScreenResult`, `policyCardSchema`. **`eslint.config.js`** — the governance import restriction. **`.github/workflows/ci.yml`** — `lint`, `test`, `build`, `e2e`, and the campaign job. **`docs/design-day2/08-…`** §5 (the growth-path table) and §6 (the framework-alignment posture and the promised mapping doc). **`19-…` §9** — the 38-control shortlist; **`18-…` §6** and **`27-…` §6** — which of them shipped, in which WP.

---

## 3. Design principles

1. **The example is the proof.** A loop that never touches a world, a pack or the app, gating tool calls through the same `runGuardrailChain` the engine uses, is what "usable in real agent stacks" means. It is a workspace, so one `npm install` at the root builds it, and it has a test, so CI keeps it true.
2. **The tarball is the boundary, checked.** `npm pack --dry-run` lists what would ship; a script asserts the list is `dist/`, the README and `package.json`, and that nothing under `dist/` mentions the toy, a pack or Svelte. The ESLint rule guards the source; this guards the artefact.
3. **The mapping is checkable, and claims nothing.** Every row names a shipped control, where it lives, and the framework clauses it can be *described* in — NIST AI RMF, the EU AI Act, ISO/IEC 42001, OWASP's agentic top ten. `08-…` §6's own words hold: "lets you prototype the mechanisms these frameworks ask for", never "complies".
4. **A release candidate, not a release.** `1.0.0-rc.1` says the API is what 1.0 will be; publishing is a maintainer's action that also needs `@craftabot/core` published, and that dependency is recorded rather than hidden.

---

## 4. The design

### 4.1 The package (stage A)

`package.json`: `version: 1.0.0-rc.1`, `private: false`, `files: ["dist", "README.md"]`, `publishConfig: { access: "public" }`, `repository`, `license`, `description`, `keywords`; the dependency on `@craftabot/core` stays `*` inside the workspace and is the recorded reason a real publish waits on core (§7). `CRAFTABOT_GOVERNANCE_VERSION` says the same string, and a test holds the two together.

**TSDoc on every export.** An audit script (`scripts/governance-exports.mjs`) walks the barrels and reports any exported symbol whose declaration has no doc comment; it runs as a test in the package so the rule outlives this WP. The main barrel's doc comment becomes the package's overview.

**README.** What the package is (the mechanisms, the compiler, the shell, the PDP document, the reports), what it depends on (`@craftabot/core`, for the contracts), the three ways in — hand-written rules through `runGuardrailChain`, a policy card through `compilePolicyCard`, a hosted service through `createHostedGuardrails` — each a short snippet lifted from the example, the reports subpath, the trace guarantees it rests on, the release-candidate status and what publishing needs, and a pointer to the mapping doc.

**`npm pack` in CI.** `scripts/check-governance-pack.mjs`: after `npm run build`, runs `npm pack --dry-run --json --workspace packages/governance`, asserts every file is `package.json`, `README.md` or under `dist/`, and greps `dist/` for `svelte`, `@craftabot/pack-`, `playroom` and `$lib/` — any hit fails. A CI step runs it in the `test` job after the build.

### 4.2 `examples/plain-node-agent/` (stage B)

A workspace (`examples/*` joins `workspaces`), TypeScript, built with `tsc` like every package, run with `node dist/index.js`, tested with vitest. No world, no pack, no app: the "agent" is a scripted brain that proposes six tool calls in turn — read a file, look something up, send an email to a colleague, send one to an outside address, delete a file, and read again once the budget is spent — over three toy tools that do nothing but say what they would have done. Before each call the loop builds a `GuardrailContext` (a minimal `AgentSpecV2`, the running `usage`, the proposed call, an empty `worldState`, the history it has kept) and runs `runGuardrailChain` at `pre-act` over:

- **hand-written rules** — `createToolBlocklistGuardrail(['delete_file'])` and `createStepBudgetGuardrail(5)`;
- **a policy card** — `compilePolicyCard` over a card whose one rule blocks `send_email` when `to` does not match `@example\.com$` (an `argument-matches` leaf), with `require-approval` shown as what a host would do with a pause;
- **a hosted service through the shell** — `createHostedGuardrails` over the example's own `GuardrailService`: a local "PII screen" that flags a national-insurance-number pattern in the decision text, with `create` and `createOffline` both answering locally, an empty `egress`, and a `ScreenRecord` that names it. The shell's `onFailure`, category dispositions and trace record all run exactly as they do for a vendor.

Every verdict is printed as the engine would emit it (`guardrail.checked` / `guardrail.tripped` in plain lines), and the run ends when the step budget stops it. The test runs the loop with output captured and asserts the four outcomes: the outside email blocked by the card, the delete blocked by the blocklist, the NI number caught by the hosted screen, the budget stopping the run — and that the trace lines carry the guardrail ids.

### 4.3 `docs/governance-mapping.md` (stage C)

One table, one row per shipped control from `19-…` §9 (the numbers `18-…` §6 and `27-…` §6 list as adopted), with columns: the control, where it lives (package and export, or screen), the WP that shipped it, and the clauses it can be described in — NIST AI RMF 1.0 function and subcategory, EU AI Act article, ISO/IEC 42001 clause, OWASP Agentic Top 10 / LLM Top 10 id where one applies. A preamble states the posture (`08-…` §6: alignment notes, not certification; the simulator controls nothing real) and how to read a row. `08-…` §5's last row gains a dated note marking it met; §6's "Keep a `docs/governance-mapping.md`" gains one pointing at the file.

---

## 5. Non-goals

Publishing to npm (a maintainer's action with a token; `private: false` and the dry-run make it a one-liner when the time comes). Publishing `@craftabot/core` (needed first; recorded, not done). A second example. Changing any export's signature — 1.0-rc is a promise about the API as it stands.

---

## 6. Stages

- **A — the package.** `package.json`, `CRAFTABOT_GOVERNANCE_VERSION`, the export audit as a test, the README, `scripts/check-governance-pack.mjs` and its CI step.
- **B — the example.** The workspace, the loop, the three ways in, the test; the root `example:governance` script.
- **C — the mapping and close-out.** `docs/governance-mapping.md`; `08-…` §5/§6 notes; this doc's stage notes; `26-…` §12; `27-…` row and §8 item 19; `CLAUDE.md`; the README map.

---

## 7. Divergences from `26-…` §6.15 and `08-…` §5, with reasons

- **`1.0.0-rc.1` with `private: false`, but `@craftabot/core` stays private.** The library's contracts are core's types, so a real publish needs core on the registry first; that is a decision about core's own API surface this WP does not make. What this WP proves is the tarball: it is the library and nothing else.
- **The example is a workspace, not a copy-paste snippet.** `26-…` says "`examples/plain-node-agent/`"; making it a workspace is what lets "one `npm install`" and a CI test both be true.
- **The export audit is a test, not a lint rule.** ESLint's `require-jsdoc` is deprecated and its replacements are plugins the repo does not carry; a forty-line script over the barrels does the job and fails the package's own test run.

> **Amended 2026-09-03 (stage A done).** As §4.1. `package.json`: `1.0.0-rc.1`, `private: false`, `files: ["dist", "README.md"]`, `publishConfig.access: public`, `license: Apache-2.0` (the repo's), `repository.directory`, and `zod` declared — it was imported by `hosted/config.ts` and `pdp.ts` and reached only by hoisting, which a published tarball would not have. `@types/node` is a dev dependency for the two tests that read a file and spawn the audit; `tsconfig.build.json` sets `types: []` so the shipped declarations stay host-agnostic, and it now excludes `hosted/test-service.ts`, which had been in `dist/` all along. Forty-six exports gained a doc comment; `scripts/governance-exports.mjs` audits both barrels and `src/exports.test.ts` runs it. `src/index.test.ts` holds `CRAFTABOT_GOVERNANCE_VERSION` to the manifest. `scripts/check-governance-pack.mjs` runs `npm pack --dry-run` and greps `dist/` for forbidden *imports* (a doc comment is allowed to say "no Playroom"); CI runs it after the build. The README is written from the example.

> **Amended 2026-09-03 (stage B done).** As §4.2. `examples/plain-node-agent` is a workspace (`examples/*`), TypeScript, `npm run example:governance` after a build. Two things the loop had to learn from the engine: the budget reads `usage.ticks` as *turns completed* before a turn begins, so the loop runs the chain at `pre-think` (nothing proposed) and then at `pre-act`; and the shell's decision selector screens the brain's *thought* with the rendered call, so the context carries a `response` — a host with no thought to give would pass its own `selectors`. The hosted screen's finding is `sensitive-data` (the category vocabulary is core's). Seven proposals: the outside email blocked by the card (`example/no-outside-mail#rule-0`), the NI number caught by the screen (`example/pii:decision`), the delete refused by the blocklist, the budget of six stopping the seventh turn. `src/index.test.ts` asserts all four and the trace lines.

> **Amended 2026-09-03 (stage C — WP50 closed).** `docs/governance-mapping.md` written: thirty-two rows over `19-…` §9's numbers, six controls named as not shipped, no compliance claim. `08-…` §5's last row and §6's promise carry dated notes. Gate: lint, every suite green (governance 18 files, the example 1), build within budget, the tarball check green, e2e green.
