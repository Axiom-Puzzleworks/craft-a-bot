# The servicing readers: the eighth reference experiment

`servicing-readers` (WP119, `docs/design-day2/105-CORPORA.md` §7) is the Jev experiment's held-out design (`98-JEV.md` §11), promoted to a reference experiment.

**What it compares.** Every row of the v3 corpus goes through the whole servicing journey, and the two judgments that read the caller's words are made five ways:
- by the bank's regex;
- by Jev asked the first questions (q1);
- by Jev asked the questions with the guide's rules in them (q2);
- by q2 behind a confidence gate at 0.80;
- by q2 behind a confidence gate at 0.90.

Each is scored against the corpus's labels by the desk's evaluators.

**The corpus** is `fs-servicing/corpus/requests-v3`:
- 96 rows of synthetic callers' words;
- written after q2 was frozen, so it is held out from q2;
- blind-labelled by a second annotator with κ 0.99 (request), 1.00 (need) and 1.00 (steer).

It lives as content (`packages/packs/fs-servicing/src/corpora/`). The book is drawn from it and says so (`Book.source.corpus`).

**How it runs.** Jev's answers are replayed from the recorded cassette (`packages/packs/typesafe/src/cassettes/`), so the experiment runs with no key and no network. It needs the optional typesafe pack, installed by `--config`:

```bash
npm run craftabot -- experiment run --config packages/packs/typesafe/craftabot.config.mjs --file experiments/servicing-readers.json --egress none --out campaign-out/servicing-readers
```

CI runs it at `--size 200` with the others and holds it to this result's shape. The book has one item per corpus row whatever the size, so the reduced run is the same run.

**What it says.** Against the regex (63.5% of requests read right, 60.4% of needs):
- Jev q1 reads 96.9% and 85.4%;
- q2 reads 97.9% and 93.8%;
- the gates read 100% of requests and 96.9% (0.80) or 97.9% (0.90) of needs.

The gates cost a person 44.8% and 47.9% of cases, where the regex costs 19.8%. 22 of the 24 effects exclude zero. The verdict is *not supported* because the design's hypothesis names more than these effects show: q2 against q1 is not a factor here, only each against the regex. The lab's own paired test of q2 against q1 (`98-…` §11, p = 0.008) is in the lab record.

**The lab record** stays with the scripts that write it: `packages/packs/typesafe/experiment/README.md`, the corpus analysis per version and reader, the calls, and the recordings. Its three original results (`servicing-jev{,-v2,-v3}.experiment-result.*`) predate WP111's change to the servicing desk: the need recorded before the act, and a review counted once. So `disclosure-recorded` and the gated `touches` differ from what today's code gives. Everything the corpus reads (the request, the need, the needs met) is unchanged. `packages/packs/typesafe/src/servicing/experiment-identity.test.ts` pins today's results under a fixed clock.

**Not evidence of** real callers: every row was written by the product's authors. A sample of real calls labelled by someone else is the missing test (`98-…` §12; the corpus's guide).

**A regression, and says so** (WP120). Its readers name their question sets, and corpus v3 has already scored Jev under q1 and q2, so the held-out rule refuses the run unless the source is marked `regression: true`. The design is marked, and every cell carries `regression: true`, because the run replays answers the corpus has seen. Since WP120 the journey reads through the `reader` executor: Jev is `typesafe/reader/jev`, the regex is `fs-servicing`'s rule readers, and the gate's person is its `else`. Every effect is the same as before.
