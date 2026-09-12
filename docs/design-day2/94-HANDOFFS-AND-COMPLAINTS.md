# 94 — Handoffs and the complaints journey (WP102)

> **Status:** WP102's design of record, opened 2026-09-12 (Phase AA, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.5.3 and the promotion in §6.5.1; G64-part). Numbered 94 because `84-…` §3's `89-`–`93-` names are WP103–WP108's notes and `89-STACKS.md` already exists. Built in one pass — the contract and the runtime, the hosts, the complaints journey, the fraud handoff — with the stage notes at the end.

## 1. Where the code is

- **`packages/core/src/types/workflow.ts`** — `StageNext = string | 'end' | StageHandoff`, `StageHandoff { handoff: workflowId; item: WorkItem }` on `StageSpec.next`. **`schemas/workflow-run.ts`** — `outcome: 'handed-off'`, `WorkflowRun.handoff { to, itemId, item }`, `WorkflowRun.handoffs[] { runId, workflowId, itemId }` (the chain back, oldest first); `docs/schemas/workflow-run.schema.json`. **`schemas/bank-run.ts`** — `counts.handedOff`, `byDesk[].handedOff`, `runs[].outcome: 'handed-off'`.
- **`packages/workflow/src/run.ts`** — the loop ending on a handoff; `RunWorkflowOptions.handedOffFrom`; **`followHandoff(run, registry, options)`**. **`bank.ts`** — a handed-off item back on the clock as an arrival, routed by kind; the lanes drain handoffs before the day ends. **`journey.ts`** — `next` returning a handoff object read as `{ handoff }`; a lit run's exit edge to the handoff.
- **`packages/evals/src/campaign.ts`** — the cell's `workflow.outcome: 'handed-off'` and `workflow.handoff`; a handed-off run is the cell's `SUCCESS`. **`monitor.ts`** — a handed-off run is not an incident.
- **`packages/harness/src/commands/workflow.ts`** — `craftabot workflow run --follow`: each handoff's target run under the same options, written under `workflows/`, on the report as `followed[]`.
- **`packages/packs/fs-advice/src/complaints/workflow.ts`** — **`fs-advice/complaints`**; `cases.ts` `complaintCaseFromItem`, `desk.ts` the `work-item` layout; `testing/plans.ts` `COMPLAINTS_STAGE_PLANS`; `fixtures/complaints-workflow-run.v1.json` (the golden run). **`packages/packs/fs-fraud/src/workflow.ts`** — the `note` stage's handoff to complaints on a disputed restriction.
- **`campaigns/desks/bank-day.json`** — the complaints desk on the CI bank day (four desks).
- **The Pipeline** — the handoff both ways (`pipeline-handoff-to`, `pipeline-handoff-from`); the list and the Pipeline's lamp read *handed-off* as inconclusive, not failed.
- **Tests** — `workflow/src/run.test.ts` (the run ends handed-off with the item; `followHandoff` carries the chain; a target not installed is refused); `workflow/src/bank.test.ts` (routed by kind, drained before the day ends; untaken counted unrouted); `fs-advice/src/complaints/workflow.test.ts` (the work-item layout; `rules-only` agreeing with the register; the five configurations; the ceilings; the returned approval; the golden run; the handoff followed twice, byte-identical); `fs-fraud/src/workflow.test.ts` (the disputed restriction hands off with the register's truth; a hold does not); `harness/src/commands/bank.test.ts` (the four-desk day); `harness/src/journey.test.ts` (the fourth journey's snapshots; the fraud exit).

## 2. Principles

1. **A handoff carries the item, never the desk** (`83-…` §6.5.3). `next` builds a `WorkItem` on the bank's own register shape — id, kind, customer, payload, truth — and the receiving journey builds its case from it as it would from a form. Nothing of the source desk's state crosses.
2. **The run that hands off has finished.** Its outcome is `handed-off`, its stages are its own, its digest is over them; the host starts the target. A handed-off run is a success of its cell and no incident on the Monitor.
3. **The chain is on the target.** The follower's `handoffs[]` is the source's chain plus the source; the source's `handoff` names the target and the item. The Pipeline links both ways from what the store holds.
4. **The host decides when to follow.** The runtime never starts a second journey on its own: `followHandoff` is called by the CLI (`--follow`), the clock puts the item back on the day, and a book cell records the handoff and leaves the target to the desk that takes its kind — the same as any arrival (§5).
5. **The complaints journey is the desk's decks as stages.** Its rule is the register's own (`fs-bank/book/registers.ts`: charges and data upheld, the rest not); DISP's timescales are stage budgets; redress is irreversible behind an approval stage (the *Redress needs approval* card rides the desk's loop stacks).

## 3. The complaints journey

`fs-advice/complaints` over `fs-advice/the-complaints-desk`, `kinds: ['complaint']`, the register (`complaintBook`) as its book.

| Stage | Executor (as written) | Budget | Out |
|---|---|---|---|
| `acknowledge` | agent, until `acknowledged` | `ACK_TICKS + 1` | `{ acknowledged: true }` |
| `investigate` | rule `investigate-v1` — the register's rule off the desk's category | — | `{ category, upheld }` |
| `root-cause` | agent, until `root-cause-found` | 4 | `{ cause }` |
| `decision` | rule `decision-v1` (a person at Level 3) | — | `{ decision: uphold \| decline, reason }` |
| `approve` | human `confirm \| return` (rule at Level 5) | — | `{ decision }` |
| `redress` | agent, until `resolved`; irreversible | `FINAL_TICKS` | `{ amount }` |
| `close` | rule `close-v1` — a decline performed where nothing resolved it; the resolution recorded | — | `{ closed: true, resolution }` |

Edges: `decision` → `approve` on *uphold*, `close` on *decline*; `approve` → `redress` on *confirm*, `close` on *return*. Five configurations: `rules-only` (the rules end to end, a person at the approval), `bot-acknowledges-only` (2), `bot-investigates` (3: the decision a person's), `bot-with-a-person-at-approval` (4), `bot-everywhere` (5: the approval the rule's). Ceilings: `redress-within-limit` 4, `redress-above-limit` 3 (the `redressLimit` knob, default 100), `complaint-declined` 3. Obligations: `fca:disp:complaints`, `fca:cd:price-value`, `fca:cd:understanding`.

The **work-item layout** (`complaintCaseFromItem`) maps the register's category to the desk's kind — advice → *advice-mis-sold*, service → *service-delay*, an upheld category → *charges-error*, the rest → *unfounded* — and puts the item's customer, id, category and summary on the complaint record and the ledger; truth is the kind's (the fair range, the deadlines, the root cause). The scripted bot reads the category off the complaint record in the prompt, never off truth.

## 4. The fraud handoff

The fraud journey's `note` stage hands off when the decision on the desk was a `freeze` or a `block-card`: the customer disputes a restriction on their account. The item is a `complaint` of category `fraud-handling` with the register's truth (`upheld: false` — the register's rule does not uphold a fraud-handling complaint), the customer from the case. A hold, a release and an escalation end the journey as before; under the scripted-optimal brain the desk holds, so the shipped fraud campaigns and books are unchanged, and the handoff is what a person's freeze (or a noisy brain's) produces.

## 5. The hosts

- **`craftabot workflow run --follow`** runs the chain to its end (eight hops at most), each run written under `workflows/<id>/`, the report's `followed[]` naming them.
- **The clock** (`runBank`) puts a handed-off item back on the day at the run's finish, with an ordinal past the clock's (`1_000_000 + n`, so its seeds are its own); a desk whose kinds include it takes it after its own queue; a kind no desk takes is counted unrouted. The lanes end only when the clock is done, every queue is empty, nothing is in flight and no handoff waits — so a day's last handoff is worked.
- **A book cell** records `workflow.handoff` and counts the run a success; the target journey is not run inside the cell (a cell is one journey over one item), which is what a bank day is for.
- **The Monitor** lists the complaints desk beside the three; the bank job routes a handed-off complaint to it as any arrival.

## 6. Divergences and findings

- **`HANDED_OFF` on `run.finished`** (`83-…` §8): a workflow run has no `run.finished` of its own — its events are the `stage.*` pair — so the outcome lives on the run record and the cell record, and `RunOutcome` is untouched, as the design asks.
- **The handoff's item builder takes the state, not a function of `(out, state)`** — `next` already receives both, so it returns the item directly.
- **The fraud handoff fires on any freeze or card block**, not only a verified caller's: the workflow's contact stage does not verify the caller (the deck's scripts do), so a verified-caller condition would never fire on a run. Recorded here; a later deck can narrow it.
- **The redress card is not on the stage boundary.** A `require-approval` at `stage-in` pauses the run, and a bank day has no one to answer it (the clock passes no `approve`), so the day's complaints stopped there; the approval is the `approve` stage's, a person's below Level 5, and the card stays on the desk's loop stacks.
- **The bank day's `completed` count** no longer equals `routed`: `completed + handedOff` does (the harness test says so).

## 7. Stage notes

> **2026-09-12.** Built in one pass: the contract and the run record, the runtime and `followHandoff`, the clock's handoff queue, the cell's record, `--follow`, the Journey Canvas's exit, the Pipeline's links; `fs-advice/complaints` with its work-item layout, rules, five configurations, ceilings, book, stage plans and golden run; the fraud journey's handoff; the complaints desk on the CI bank day; the tests named in §1.
