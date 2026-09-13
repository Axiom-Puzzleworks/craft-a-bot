# Manufacturing — a synthetic plant

> **Status:** a blueprint note, written 2026-09-13 (WP108; `83-…` §6.6.3). The checklist in [`DOMAIN-PACK.md`](DOMAIN-PACK.md) applied to a plant, without code. The fixture `fixtures/manufacturing.domain.json` is the `DomainSpec` this note describes; it validates and fails `checkDomainPack` because no pack is installed. **Not scheduled.**

## 1. The world

**Root entity:** a _work order_ — a number from the seed, a machine, a product and a quantity, a due date, a status, the operator assigned, and a quality lot it produces. **Around the work order:** machines (a type, an age band, a maintenance history, a lock-out state), maintenance jobs (preventive on a schedule, corrective after a fault), quality lots (a sample result against a specification, a hold or a release), suppliers (a part, a lead time, a non-conformance history), incidents (a near miss, an injury, an environmental release — each with a severity).

**Lines** (five, every operation tiered): _MES_ — the execution system (read the schedule — observe; start / stop a work order — reversible), _CMMS_ — maintenance (read a job — observe; schedule — reversible; dispatch — reversible; **override a lock-out/tag-out — irreversible and never the assistant's**), _quality_ (read a result — observe; hold a lot — reversible; release — _irreversible_), _procurement_ (read a supplier — observe; raise a non-conformance — reversible; block a supplier — irreversible), _EHS_ — safety (read an incident — observe; report — reversible; classify severity — reversible).

**The calibration table:** the machine age and fault-rate mix a stated assumption (plant data is private), the incident rates from the HSE's RIDDOR statistics for the sector, the supplier lead-time bands from the ONS business surveys, the quality-hold rate a stated assumption. Six rows, two cited, four stated.

**Personas:** the shift supervisor who needs the line back; the operator who says the guard is fine; the quality engineer who will not release; the supplier's rep who disputes the non-conformance.

## 2. The journeys

| Journey                             | Status     | Stages (sketch)                                                                             | Where the assistant stops                                                                                                  |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Maintenance scheduling and dispatch | shipped    | fault → classify (rule: the fault table in truth) → schedule → dispatch → confirm           | scheduling the assistant's (4); a job on a locked-out machine needs a person (3); the override is **1**                    |
| Quality hold and release            | shipped    | result → compare (rule: the specification in truth) → hold → investigate → release or scrap | a release is a person's below four eyes (3); a hold the assistant's (4)                                                    |
| Supplier non-conformance            | shipped    | lot → trace to the supplier → raise → supplier response → close or escalate                 | raising the assistant's (4); blocking a supplier a person's (3)                                                            |
| Incident reporting                  | shipped    | report → classify severity (rule: the RIDDOR table in truth) → notify → investigate → close | a reportable incident is notified by a person (2); the assistant drafts                                                    |
| Production scheduling               | supporting | —                                                                                           | a layout the others read; no workflow                                                                                      |
| Machine safety changes              | out        | —                                                                                           | _why:_ a change to a guard or an interlock is an engineering change under PUWER with no desk; out                          |
| Permit to work                      | out        | —                                                                                           | _why:_ the permit is a paper-and-person control by design; the domain refuses to model it as a journey the assistant walks |

## 3. The obligations and the rights

**The vocabulary:** `iso-45001:ohs` (occupational health and safety management: hazards identified, controls kept), `puwer:machinery-safety` (work equipment safe, guarded, maintained; lock-out/tag-out honoured), `iso-9001:traceability` (a lot traceable to its inputs and its release decision), `riddor:reporting` (reportable incidents notified within the time), `hse:incident-investigation` (an investigation on every incident, a person's), `coshh:substances` (substance controls read before a job on them), `equality-act:fairness` (reused, over the operator's shift and agency status — the parity axis).

**Decision rights:** `loto-override`, **1** (never the assistant's; PUWER); `lot-release`, **3** (ISO 9001); `lot-hold`, **4**; `maintenance-dispatch`, **4**; `job-on-locked-machine`, **3**; `supplier-block`, **3**; `reportable-incident-notification`, **2** (RIDDOR); `severity-classification`, **3**.

## 4. The special category

**Incident and injury records** — a person's injury is health data — and the ontology names them so: classes `WorkOrder`, `Machine`, `MaintenanceJob`, `QualityLot`, `Supplier`, `Incident`, `Operator`; special: `Incident`. The maintenance and quality journeys never see an incident's detail; the incident journey sees it under its purpose.

## 5. What the blueprint predicts is hard

- **The autonomy ceiling of 1.** A journey where the assistant may only draft: `loto-override` at 1 means no configuration — not even _bot everywhere_ — lets the assistant call it, and the desk ships no action that does. The interesting configuration is the blueprint's `human`-everywhere one, where the assistant's whole contribution is the draft and the human-load rows measure a journey the assistant does not decide at all. Nothing in the runtime enforces the ceiling (`64-…` §6.5); the desk's action list does, and `domain.decision-kinds` holds the configurations to the right.
- **Safety evaluators over the world's state, not the transcript.** _No dispatch to a locked-out machine_, _no release outside specification_, _notification within the time_ — every one deterministic over `action.performed` and the world's state; the rubric judge barely features.
- **Truth that is a specification.** The specification limits and the fault table are truth; the revealed result carries the flag, not the limit.
- **The cohort is a shift.** Parity over shift and agency status — _is the night shift's near miss classified lower?_ — is the fairness reading, and it is a labour question.

## 6. The checklist, reviewed against the scaffold's tree

- [ ] 0 — the spec (`fixtures/manufacturing.domain.json`) validates.
- [ ] 1 — the packs: `plant` (world), `maintenance`, `quality`, `supplier-nc`, `incidents`.
- [ ] 2 — four shipped, one supporting, two out with a reason.
- [ ] 3 — every stage's obligation in the seven-tag vocabulary.
- [ ] 4 — eight rights; every ceiling among them; `loto-override` at 1 with no desk action behind it.
- [ ] 5 — a control row per obligation.
- [ ] 6 — six calibration rows, two cited, four stated with a note; pending review.
- [ ] 7 — one special class; every incident record classified.
- [ ] 8 — five lines, every operation tiered; the override and the release irreversible.
- [ ] 9 — four personas.
- [ ] 10 — a book and a campaign per shipped journey.
- [ ] the golden run per journey; the red run per journey; the matched pair on incidents (shift); the sweep.

## 7. What would be typed, by count

| Piece                                       | Count                      |
| ------------------------------------------- | -------------------------- |
| World pack files                            | ~15                        |
| Calibration rows                            | 6                          |
| Journey packs                               | 4                          |
| Per journey: actions / predicates / layouts | 5–6 / 3 / 8–10             |
| Per journey: goal cards / scenarios         | 8 / 14–18                  |
| Policy cards                                | ~16                        |
| Evaluators (deterministic / rubric)         | 5–7 / 0–1 per journey, ~26 |
| Control rows                                | 7                          |
| Decision rights                             | 8                          |
| Campaign files                              | 8                          |
| Playground pages                            | 4                          |
| Tests                                       | ~28                        |

## 8. Sizing

The world is the bank's size with more classes and fewer people; the journeys are the shortest of the three notes (the incident journey the longest). The world pack **M**; the four journeys **S–M** each; the `human`-everywhere configuration and its human-load reading a session of its own. **About four to five sessions of M.** Not scheduled.
