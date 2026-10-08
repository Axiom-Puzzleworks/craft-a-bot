# The 35B suite: the live-tier tests re-performed with a smaller model (2026-10-08)

The ten live designs of `../live/TEST-REPORT.md`, re-performed with **Qwen3.6-35B-A3B** (`Qwen3.6-35B-A3B-NVFP4`, cartridge `dgx-spark/quick-qwen`) in the brain's seat instead of the 122B, **every design performed twice**, on the same books, prompts, rules, reply limit (2,048 tokens), temperature (0) and timeout (180 s). The generated tables are `README.md` and `COMPARISON.md` in this folder; the runbook is `RUNBOOK.md`. Every figure is a measurement of this synthetic bank from one sample of each model, never a statement about either model in general. **The prompts were tuned against the 122B** (the desks' stage goals and refusals were reworded where it stalled), so a stall the 35B shows that the 122B did not is a finding about the prompts' fit to a smaller model as much as about the model.

## 1. What was run

Pass 0 and pass 1 of ten designs, on the Sparks in the `fast-pair` pattern (the 35B in `chat` mode on both units, 262k context), 16 cells at a time. **1,890 cells, 16,133 calls, 95 minutes** of wall time (the 122B suite: 317 minutes for 1,792 cells). Every recording is verified against its live store and reproduced exactly by `live-check --suite quick`. A **smoke** of 46 items across nine designs came first (`recordings/smoke-quick/`, local): it predicted the stalls below to within a few points.

| Design | Performed | Cells | Calls | Wall time |
|---|---|---:|---:|---:|
| onboarding | 2× | 132 | 780 | 3 min |
| disputes | 2× | 160 | 948 | 5 min |
| complaints | 2× | 220 | 582 | 3 min |
| servicing | 2× | 132 | 690 | 3 min |
| servicing, live customer | 2× | 64 | 690 | 3 min |
| `controls-live` | 2× | 162 | 1,681 | 11 min |
| collections | 2× | 148 | 1,889 | 9 min |
| lending | 2× | 408 | 2,564 | 15 min |
| advice | 2× | 248 | 3,879 | 32 min |
| fraud | 2× | 216 | 2,430 | 12 min |

## 2. The results beside the 122B

| Design | Measured | 122B | 35B | pass^2, 122B / 35B | Cells lost, 122B / 35B |
|---|---|---|---|---|---|
| Onboarding | decision matches the rule | 100% | 100% | 100% / 100% | 2% / 0% |
| Disputes | decision matches the rule | 81% (69–93%) | **94% (86–99%)** | 80% / 90% | 4% / 1% |
| Complaints | root cause named | 99% | 96% (93–99%) | 98% / 93% | 0% / 4% |
| Servicing | needs met | 100% | 100% | — / 100% | 0% / 1% |
| Collections | plan matches the rule | 100% | 100% | 100% / 100% | 2% / 14% |
| Lending | agreement with the rule | 100% | 100% | 100% / 100% | 3% / 3% |
| Advice | recommendation suits the customer | 100% | 100% | 100% / 100% | 0% / **40%** |
| Fraud | alert decision | 96% (82–99%) | 94% (87–100%) | 96% / **89%** | 12% / 22% |

*Cells lost* are bot cells that did not end in success (an error or a stack stop). The decision metrics are scored over the items the cells completed.

**Where the 35B matches the 122B.** On onboarding, lending and collections, where the desk's rule is on the case file and the journey is a short chain of tool calls, the 35B reads the same 100% as the 122B, in a fifth of the time. A model a fifth of the size uses a rule it can see.

**Where it does better.** On disputes the 35B agrees with the rule in 94% of items against the 122B's 81%: the model that misclassified about one dispute in five is not the smaller one. The 35B was also not tempted by the planted notes: reimbursed-within-limit reads 99% without the stack, so the *Within the limit* card, which took the 122B from 94% to 100%, has almost nothing to catch here.

**Where it does worse: it does not call the tool.** Complaints (4% lost), collections (14%), fraud (22%) and above all **advice (40% of cells lost)** lose cells because the 35B often replies in plain prose when the desk needs a tool call. In the smoke, 77% of advice replies, 58% of collections', 40% of fraud's and 30% of onboarding's were text with no call, against 0–3% for lending, disputes and complaints. The failure repeats: in one advice cell the bot sent the same greeting and question twenty times as text until the stage ceiling ended the cell. The desks that need a *say* action to keep a conversation going are where it fails; the desks that are a chain of lookups and decisions are where it does not. This is a finding about the model's tool-call discipline on these prompts, left as it is by the owner's choice of an unchanged suite.

## 3. Controls and the attack scenarios

- **`controls-live`:** unaided, the 35B resisted every attack exactly as the 122B did (kept the secret, the key, the ball and the code; no false alert; no malformed give: 100% in every scenario), so no component has a safety effect to measure and the verdict is *inconclusive*. The components that act do so on termination: `no-progress` takes `ran-out-of-steps` from 100% to 83% (the component ends 17% of runs early), `marking` to 94%, `peer-auth` to 89%.
- **Fraud, the one stack that moved the wrong way.** Alert decision is 94% without the stack and 81% with it (the register's verdict is *not-supported*): the only comparison in either suite where a control lowers a measure. Errors are spread across all four arms (10, 11, 11 and 15 of 54 cells), so it is not simply the stack's extra losses, but the stack arm also carries the stalls (a refused report re-filed, an alert re-opened) and this is the reading the data allows, no more. Reliability on fraud is the lowest: consistency 89% (67% in one arm).
- **Disputes' stack:** decision matches 94% → 98%, reimbursed within the limit 99% → 100%, both inside their intervals: *inconclusive*.

## 4. What this adds to the 122B record

1. **Rule visibility generalises.** The 122B's headline (seeing the rule was the whole difference) is not a property of the large model: the 35B reads 100% on three desks once the rule is on the file.
2. **The prompts are tuned to one model.** The stalls are not random: they cluster on the desks and stages where the bot must *speak through a tool*, and they are exactly the dead ends the 122B was fixed to avoid by rewording. A smaller model needs either its own wording or a tolerance for a prose reply, which is an engine decision the owner declined for this suite (option 2 in the staging note).
3. **A larger model is not uniformly more accurate.** On disputes the smaller model scored higher. One design, two models, 40 items: not a ranking, and the intervals overlap (the 122B's 69–93% against the 35B's 86–99%), but it is a reason not to assume the large model is the safe baseline.
4. **Cost.** The 35B suite took 95 minutes against 317; tokens a case are similar on most designs and higher where the model stalls (advice 63,600 against 42,100; collections 27,300 against 16,400).

## 5. Limits

- One sample of each model at temperature 0, performed twice. The 35B's non-determinism is its own and is read from the trials (consistency 89–100%), not assumed from the 122B's.
- The suite was run on prompts tuned for the 122B; it measures fit as much as capability. A 35B-tuned run would be a separate experiment.
- A cell lost to a stall has no evaluation for the later stages, so a design with many lost cells (advice, collections, fraud) is scored on fewer completed items than its *n*; the lost share is in the table.
- Small n (fraud 27 items, the servicing seat 16); most designs are at a ceiling and the register reads them *untestable* or *inconclusive*; none is *supported*.
- Synthetic bank and rules; the new incidence and temptation shares are assumptions awaiting review.

## 6. Reproduction

```bash
node scripts/live-check.mjs --suite quick     # every design replayed from its cassette, held to the committed result
node scripts/live-column.mjs --suite quick --check
node scripts/live-compare.mjs --check
node scripts/live-record.mjs --suite quick --all --resume   # the run (needs the Sparks in fast-pair)
```

Cassettes, results, stories and `cells.json` per design are under `docs/evidence/live-35b/<design>/`; the live runs' own stores are under `recordings/35b/` (local, gitignored).
