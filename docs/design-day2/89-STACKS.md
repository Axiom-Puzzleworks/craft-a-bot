# 89 — Stacks as content (WP97)

> **Status:** WP97's design of record, opened and built 2026-09-12 (Phase X, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.2.5, G60, G67). Reviewed before the Phase X exit review.

## 1. Where the code is

- **`packages/core/src/schemas/stack.ts`** — `stackSchema`, `stackFitSchema`, `stackGroupSchema`, `guardPointSchema`; `Stack` and friends; `docs/schemas/stack.schema.json` generated and checked on build. `PackManifest.stacks?`; the registry's `getStack`/`listStacks`, refusing a stack that does not parse at registration; the content kind `stack` (`local/stacks/<slug>`, folded into the local pack's `stacks`); the evidence kind `stack`; `BrickRuntimeContext.getStack?`/`getGuardrailComponent?` and `BrickValidationContext.hasStack?`; `safetyBrickSchemaV2.stack?`; `WorkflowConfig.stack?`/`stageStacks?` on the record too.
- **`packages/governance/src/components/stacks.ts`** — `stackLoopFits`, `stackBoundaryFits(stack, stageId)`, `stackEgressFits`, `stackGroupOf`, `compileStackLoop`, `stacksForStage`; `stageBoundaryGuardrails(registry, deps, stacksFor?)` takes the stacks that apply at a stage.
- **`packages/packs/fs-bank/src/stacks.ts`** — `deskStacks(options)`: a desk's baseline guards as stacks, from the values the bricks are built from. The three desks ship four each (`fs-lending/stack/policy-cards`, `…+local-classifier`, `…+hosted-guard`, `…/compliance-watchbot`) and the complaints desk one (`fs-advice/stack/complaints-policy-cards`), on their manifests.
- **`packages/evals`** — `campaignGuardSchema.stack?`, `resolveGuardStack` (in `resolveCampaign`, once); a book cell's journey stack on the loop chain and the per-stage stacks through the boundary compiler; the experiment's `guard` level naming no template guard is a stack by that id; `AnalyseOptions.stacks` joins a stack's `controls` to the effect's.
- **`packages/packs/starter`** — the Safety brick's `stack`: a brick with a stack *is* the stack.
- **`packages/pack-testkit/src/checks/stack.ts`** — `checkStack`; `describeConformance` runs it over `manifest.stacks` (`fixture.stacks.resolve: false` when the components live in packs the companions do not include; `harness/src/stacks.test.ts` resolves every shipped stack against the whole registry).
- **`packages/harness`** — `craftabot evidence push --stack-file <stack.json>`; `stacks.test.ts`; the identity test's stack mode; `evidence-stack.test.ts`.
- **`apps/workbench/src/lib/workshop/stacks.ts`** — a reader: `stacksFor(spec, registry)`, `applyStack(spec, stackId, registry)`, `stackOf(spec)`; the Spec Lab's *Named stacks* lists the desk's stacks; `lib/workshop/evidence.ts` pushes a stack (`itemForStack`) and lands a pulled one in the content store.

## 2. Principles

1. **A stack is content.** A named list of component fits with the points they decide at, what it claims to serve, and who wrote it — shipped by a pack, kept by the content store, pushed to the evidence store with a digest. Nothing in a stack is a mechanism: every fit names a component (`85-…`) and the session runs the same `Guardrail`s it would from bricks.
2. **One representation of the chokepoint.** The group Watchbot's rules and the evaluator breakers are the stack's `group` half, in the shape a campaign guard's `group` has had since WP64 — never a fit at the `group` point (`checkStack` refuses one).
3. **The identity test is the proof.** Every desk baseline, run with its guards as bricks and again with each guard named as the desk's shipped stack, gives the same `guardrail.checked` sequence per cell.
4. **Composition is unbounded in a stack and bounded in the tray.** A Safety brick with a stack fits the socket as one brick, however many components the stack has; `SLOT_CAPACITY.safety` stays four bricks and the Kit's one-well rule is untouched (G67).

## 3. The schema

```ts
interface Stack {
  schemaVersion: 1; id: string; name: string; description: string;   // id: `{packId}/stack/{slug}` or `local/stacks/{slug}`
  fit: Array<{ componentId: string; config?: unknown; point: { kind: PointKind; at?: string } }>;
  group?: { watchFor: string[]; refusalLimit?: number; breakOn: Array<{ evaluatorId; labels?; onFail? }> };
  obligations?: string[]; controls?: string[];                           // the register's join key: `{mapId}/{ref}`
  provenance: { author: Principal; createdAt: string; derivedFrom?: string };
}
```

`point.at` is a stage id for a boundary fit (absent: every stage) and a host pattern for an `egress` fit.

## 4. Where a stack's fits run

| Point | A campaign guard `{ stack }` | A workflow configuration `{ stack }` / `{ stageStacks }` | The Safety brick `{ stack }` |
|---|---|---|---|
| `pre-think`, `pre-act`, `post-act` | the cell's `components` (after the guard's own), on every session | the journey's on every agent stage's session (`RunWorkflowOptions.guardrails`); a stage's on that stage's session is left to WP100's drawing — today the per-stage stack's loop fits are not run (§8) | the brick's whole contribution |
| `stage-in`, `stage-out` | not run — a campaign guard is a session's | the journey's at every stage, a stage's at that stage, after the stage's own `guards` (`stageBoundaryGuardrails`'s third argument) | not run |
| `egress` | the cell's session mode (`egressForGuard`) | not read (§8) | not read |
| `group` | the guard's `group`, unless the guard names its own | — | the Spec Lab fits the Watchbot and the judges beside the brick (WP64's chassis) |

`resolveGuardStack` runs once, in `resolveCampaign`, so a cell never sees a `stack` field: the report's `guard` id is the guard's own, and `--resume`, sharding and the Worker are untouched.

## 5. The Safety brick and the Spec Lab

`safetyBrickSchemaV2.stack?` names a stack. With one set, `contributeGuardrails` returns `compileStackLoop(stack)` and nothing else — the dials (`maxTicks`, `blockedActions`, `approval`, `policyCards`) are inert, since the stack says what runs; a stack the workbench does not have is `unknown-stack` (a warning) at validation and the dials run at run time. The Spec Lab's *Named stacks* lists `stacksFor(spec)` — the desk's pack's stacks and any `local/` one — and `applyStack` writes the stack onto the Safety brick, keeping its config; for a stack with a `group` half it also fits the Monitor Judges (up to the socket's room) and the Watchbot, exactly as WP64's preset did, so the readback (`stackOf`, off the brick's config) names the stack and the socket reads `4 of 4`.

## 6. The evidence store and the register

`evidence push --stack-file` pushes a stack under its own id; `evidence pull` writes it back and the Workshop lands a pulled stack in the content store as `local/stacks/<slug>`. `AnalyseOptions.stacks` hands `analyseExperiment` the stacks its `guard` factor's levels may name; their `controls` join the experiment's on every effect's `controlIds`, so `controlEffectiveness` shows the stack's effect on the control's row with no change to the register. The shipped stacks claim every row of their desk's control map.

## 7. `checkStack`

Three refusals: `stack.point` — a fit names a component nothing ships (unless `resolve: false`), or a point the component does not declare, or a config its schema refuses; `stack.capacity` — the same component at the same point with the same config twice; `stack.stand-in` — a component with a connection and no stand-in, which a browser edition cannot run. Plus `stack.well-formed`: the schema, and no fit at `group`. Tests: `harness/src/stacks.test.ts` (every shipped stack resolves and compiles; the three refusals), `component-identity.test.ts` (the three desk baselines, guards as stacks), `evals/src/stacks.test.ts` (resolution, the group precedence, an unknown stack, the experiment level), `starter/src/safety-stack.test.ts` (six components as one brick; the dials inert; the unknown-stack warning), `workbench/src/lib/workshop/stacks.test.ts` (the reader), `harness/src/commands/evidence-stack.test.ts` (the round trip).

## 8. Divergences and findings

- **The `+hosted-guard` stacks are the floor alone.** The desk baselines fit `geap/model-armor` with `serviceConfig: '{}'`, which the service refuses, so the Guard brick has run *unplugged* — its step budget and nothing else — since WP42. The stacks say so (`deskStacks`' `hostedGuardConfig`, absent → the floor), so the identity holds and the content is honest. Giving the baselines a stand-in config (`projectId`/`location`/`templateId` for the offline client) is a change to the campaigns' behaviour and their CI gates, and is left for the Phase X exit review to decide.
- **A per-stage stack's loop fits do not run** on that stage's session: the workflow runtime has one shared `guardrails` chain for every stage. WP100's canvas is where a per-stage loop chain is drawn; until then a per-stage stack is its boundary fits.
- **A workflow configuration's `egress` fit is not read**: the workflow runtime's egress is the host's option.
- **`craftabot run --stack`** still takes a campaign file's guard, as WP64 built it; a stack id there is WP101's Studio.
- **The five presets** in `83-…` §6.2.5 are the desk baselines' five guards (`none` needs no stack); `stacks.ts` had one preset, the Compliance Watchbot, which is now the desk's `compliance-watchbot` stack read off the registry.
