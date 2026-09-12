# 88 — The Guardrail Studio (WP101)

> **Status:** WP101's design of record, opened 2026-09-12 (Phase Z, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.3, tenet 27, G60-part and G65-part). Stage A is this note — the three columns, the drag and the keyboard fit, the verdict-flow fold, the side-by-side, the connections tab, *Use in…*. Stages B and C follow; each stage's note is at the end.

## 1. Where the code is

- **`packages/governance/src/reports/verdict-flow.ts`** — `verdictFlow(events)`, `verdictFlowSignature(rows)`: every `guardrail.checked` as a row, in order (§4).
- **`apps/workbench/src/lib/workshop/studio.ts`** — the pure folds: `emptyStack`, `fitAt`, `unfit`, `configure`, `renamed`; `filterComponents`, `groupByTechnique`, `connectionLamp`; `stackTestCampaign`; `stackRecord` (§3, §5, §6).
- **`apps/workbench/src/routes/workshop/studio/+page.svelte`** — the Studio: the catalogue, the journey and its points, the test bench; the *Connections* tab. **`lib/components/workshop/Connections.svelte`** — the Guard Rack, moved whole (§7); `/workshop/guards` redirects to the tab.
- **`lib/worker/protocol.ts`, `campaign-client.ts`, `campaign-host.ts`** — the `stack-test` job (§5).
- **The Spec Lab's stack panel** — a picker of the shipped and saved stacks with *Open in the Studio*; the Campaigns and Experiments pages open on a stack (§6).
- **Tests** — `governance/src/reports/verdict-flow.test.ts`; `harness/src/verdict-flow.test.ts` (the injection baseline's four scenarios); `workbench/src/lib/workshop/studio.test.ts`; `e2e/studio.spec.ts`; the lenses matrix, the axe sweep and the visual set carry the route.

## 2. Principles

1. **One fit, two hands** (tenet 27). A drag and a keyboard fit both call `fitAt(stack, component, point)`; there is no second path, so the test that they produce the same stack is a test of the one function and of the two handlers reaching it.
2. **The flow is the trace.** The verdict flow is `guardrail.checked` in order and nothing more — the fold adds only what the events beside it say (the hosted call's latency, the denial's cause). A flow that disagreed with the trace would be a bug in the fold, and the harness test holds them equal over the four shipped scenarios.
3. **The bench runs the loop.** A scenario runs a bot's loop; its points are the loop's three hooks. A stack's boundary fits (`stage-in`, `stage-out`) run only in a journey, so the bench carries the loop fits alone as the guard's `components` and says so; a journey's boundary is tested from the Pipeline's what-if under a configuration that names the stack.
4. **Content, with provenance** (`89-…` §2). *Save* writes a `stack` content record under `local/stacks/<slug>` with the browser principal as author; a saved stack reloads and compiles to the same guardrails.
5. **The Guard Rack moves, unchanged.** Its test ids and behaviour are kept whole under the *Connections* tab; the old route redirects.

## 3. The stack under construction

`Stack` (`89-…` §3) held in page state. `fitAt` refuses a point the component does not decide at (its `points`), and treats a second fit of the same component at the same point as the same stack; `configure` sets a fit's config (parsed by the component's `configSchema` on the page, the Sinks pattern); `renamed` re-slugs the id. A point is `{ kind, at? }` — a loop hook, a stage boundary with the stage id, `group` or `egress`.

**Choosing the journey.** The centre draws the Journey Canvas (`87-…`) of a chosen workflow with every point, or — *the loop alone* — a three-point strip for a Playroom bot. Selecting a point on the canvas (click, or `g` from a node and `Enter`) with a component selected in the catalogue fits it there; dragging a catalogue card onto a point does the same through the browser's own drag (`draggable`, the component id on `dataTransfer`, the point's `drop`) — the Baseplate's `DndController` is a socket machine with its own geometry, and a card onto a button needs none of it. The stack lists beneath the canvas: each fit with its point, its `explain` line and its config form; a fit is removed with its button.

## 4. The verdict flow

```ts
interface VerdictFlowRow {
  seq; tick; guardrailId; hook; point?; componentId?; policyCardId?;
  verdict: 'allow' | 'annotate' | 'redact' | 'pause' | 'block-action' | 'stop-run';
  reason?; cause?; latencyMs?; findingCategory?; redactedText?;
}
verdictFlow(events): VerdictFlowRow[]
```

One row per `guardrail.checked`, in event order. `latencyMs` is the `latencyMs` of the `guardrail.external` written immediately before it for the same guardrail and hook (core writes the pair in that order, `29-…` §4); `cause` is the denial's `could-not-check`; `findingCategory` and `redactedText` come from the allow-branch's component fields (WP94, WP96). `verdictFlowSignature` reduces a flow to `guardrail@hook:verdict` strings, which is what two flows are compared on.

## 5. The test bench

Pick a scenario (the registry's, the Playroom's four first), a brain (`scripted-optimal`, `scripted-noisy`), a seed. **Run through the stack** builds the one-cell campaign (`stackTestCampaign`): the scenario under `starter-default`, a guard per stack whose `components` are the stack's loop fits, the brain, the seed — and posts it to the Worker as a `stack-test` job, which the host runs as the campaign it is (the kind stays so the host can say what it sent, the `book` pattern). The trace lands per guard; the bench draws each flow as rows and lights the verdicts on the canvas's loop points. **Pin** a second stack and the run carries two guards over the same scenario and seed; the two flows sit side by side, their signatures compared and the first difference named.

## 6. Save and Use in…

**Save** parses the stack (`stackSchema`) and writes `stackRecord` through `Storage.putContent`; the Spec Lab's picker lists it beside the pack's (`stacksFor` reads `local/`). **Use in…** opens: the Campaigns page with `?stack=<id>` (its editor appends `{ id, fit: [], stack }` to `guards[]`); the Experiments page with `?guard=<id>` (the design's guard becomes the stack — `AuthorInput.guard`); the Pipeline's what-if (a configuration naming the stack is the journey's own content and is not written from here — noted); the Spec Lab with `?stack=<id>` (its picker preselects it).

## 7. Connections

The Guard Rack (`30-…` §5, WP99's lamp and refusal) is the Studio's second tab, whole: the services, their batteries, *Test it* offline and live, *Fit into bot*, the connection's lamp. `/workshop/guards` redirects to `/workshop/studio?tab=connections`; the rail's entry is *Studio* (the assurance lens says *Controls* for a component, and its rail label stays *Studio*).

## 8. Tests (the acceptance in `84-…` §3, restated)

1. A drag and a keyboard fit produce the same stack (`studio.test.ts`: two calls of `fitAt`; `studio.spec.ts`: the keyboard fit on the page yields the listed fit).
2. The verdict flow over the injection baseline's four scenarios equals the traces' `guardrail.checked` sequences (`harness/src/verdict-flow.test.ts`).
3. Two stacks side by side over one run (`studio.spec.ts`).
4. A saved stack reloads and compiles identically (`studio.test.ts`).
5. *Use in…* adds a `guards[]` entry to the Campaigns editor and a guard to an experiment's design (`studio.spec.ts`).
6. The Studio under every lens (the lenses matrix), axe and the keyboard walk, the visual baseline `ws-studio` with a fixture stack.

## 9. Divergences and findings

- **The bench runs loop fits only** (§5); a stack's boundary fits are tested through a journey configuration on the Pipeline. `83-…` §6.3 does not say which; this note does.
- **The vendor config surface** on a connection is the service's own `configSchema` block the Guard Rack already edits (a Model Armor template id, an Azure endpoint, an OPA bundle URL, an Ollama model name); nothing new was built for it.
- **Use in… a workflow configuration** is not offered: a configuration is a workflow's content in its pack, and the Pipeline's what-if takes a named one. Writing a local configuration is a later WP.

## 10. Stage notes

> **Stage A — 2026-09-12.** This note: the principles (§2), the stack under construction and the one `fitAt` (§3), the verdict flow (§4), the bench over loop fits (§5), Save and *Use in…* (§6), the Guard Rack as Connections (§7), the tests (§8), the divergences (§9).

> **Stage B — 2026-09-12.** `verdictFlow`/`verdictFlowSignature` in `governance/reports/verdict-flow.ts` (over the Armour and confused-deputy goldens; `harness/src/verdict-flow.test.ts` holds every trace of the injection baseline at seed 1 equal to its `guardrail.checked` sequence); `lib/workshop/studio.ts` with `studio.test.ts` (a drag and a keyboard fit are one `fitAt`; a saved stack reloads and compiles identically over the local classifier; the bench's campaign carries the loop fits; the filters and the lamps); `/workshop/studio` — the catalogue with its lamps, the loop's three points or a journey's canvas with `onPoint`, the stack with its `explain` lines and settings, the bench with the flow per stack and the first difference between two; the `stack-test` job (`protocol.ts`, `runStackTestIn`, the host running it as the campaign it is); `Connections.svelte` (the Guard Rack, moved whole; `/workshop/guards` forwards); the Spec Lab's *Open in the Studio* (`?stack=&agent=`) and `?stack=` preselecting; the Campaigns editor's `?stack=` appending a guard; `AuthorInput.guard` and the Experiments page's `?guard=`; the *stack* roundel. Two decisions on the way: a component whose `configSchema` refuses an empty config (the built-ins' budgets and lists) is fitted with no config and the note says to fill its settings; the local classifiers' connections say `browserCapable: false`, so the lamp reads *harness only* for them whatever the vault holds — the stand-in still runs on the bench.

> **Stage C — 2026-09-12.** The rail's entry is *Studio* (`RailId` `guards` → `studio`; the layout maps both routes to it); the assurance lens says *control* for a component (`VOCABULARY_TERMS` gains `component`/`components`); `e2e/studio.spec.ts` (the keyboard fit, the run, the pinned pair, the save, *Use in…* both ways, the forwarded address); the two Studio routes on the axe sweep; the lenses matrix carries `studio`; `ws-guards` re-taken over the Connections tab and `ws-studio` over the lending desk's policy-card stack. The command palette entries `84-…` names for the Studio are WP109's (the palette does not exist yet).

