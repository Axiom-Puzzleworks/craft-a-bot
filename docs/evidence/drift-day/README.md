# drift-day

**Hypothesis** (`64-TARGET-DESIGN-V5.md` §6.8.3): a bank day with a planted mid-day shift in application amounts is flagged by PSI within two hours of simulated time, and the agreement series does not move.

**Why there is no result file here.** The seven other reference experiments are campaign-shaped: a design over a book, expanded to campaigns, folded into effects (`72-EXPERIMENTS.md`). This one is about the clock — the shift is planted _during_ a day, and the flag is the Monitor's, raised over a rolling window against the population's reference (`75-THE-MONITOR.md` §4). An experiment file cannot say that; a bank-day experiment kind could, and is recorded as the one `64-…` §6.8.3 row WP90 leaves open (`80-CONTROL-EFFECTIVENESS-REGISTER.md` §4).

**Where the claim is tested today.** `packages/packs/fs-lending/src/monitor.test.ts` holds the Monitor's fold over a book worked both ways and asserts the PSI drift readout over the day's buckets against the population's reference; `packages/workflow/src/bank.test.ts` and CI's _Run a day at the bank_ step run the three-desk day (`campaigns/desks/bank-day.json`) and keep its `BankRun`. Planting the shift and timing the flag is the bank-day experiment kind's job.
