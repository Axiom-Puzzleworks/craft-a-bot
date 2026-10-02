# Timings

Full-size runs on 2026-10-02 (`craftabot experiment run --egress none --jobs 4`; the first run of each design was 2026-09-29, `servicing-readers` 2026-09-30, `controls` and `ceilings` WP150's), one machine: Windows 11, 20 logical cores, Node from `nvm4w`. Wall time is the whole command: the population drawn, every campaign run, the reports folded. Since WP116 (`103-FALLIBLE-ACTORS.md` §6) every design runs each factor under two brain tiers — its scripted tier and the fallible one — with the bank's case handler as the reviewer, so each takes about twice as long as on 2026-09-11.

| Experiment | Verdict | Effects | Untestable | Excluding zero | n per side (first effect) | Wall time (s) |
|---|---|---|---|---|---|---|
| `lending-stack` | inconclusive | 12 | 6 | 2 | 783 | 140 |
| `lending-context` | inconclusive | 8 | 6 | 0 | 783 | 121 |
| `lending-fairness` | inconclusive | 4 | 2 | 0 | 783 | 57 |
| `lending-knobs` | not-supported | 8 | 4 | 2 | 783 | 127 |
| `fraud-stack` | inconclusive | 8 | 6 | 0 | 2912 | 632 |
| `advice-context` | not-supported | 8 | 4 | 2 | 92 | 34 |
| `human-oversight` | not-supported | 36 | 15 | 19 | 783 | 313 |
| `servicing-readers` | not-supported | 24 | 0 | 22 | 96 | 22 |
| `controls` (WP150; re-pointed WP153, 2026-10-02) | not-supported | 144 | 66 | 25 | 180 | 108 |
| `ceilings` (WP150) | inconclusive | 4 | 1 | 2 | 783 | 110 |
| `disputes-stack` (WP150; fallible WP154) | inconclusive | 4 | 3 | 0 | 300 | 28 |
| `collections-stack` (WP150; fallible WP154) | inconclusive | 4 | 3 | 0 | 400 | 33 |
| `onboarding-stack` (WP150; fallible WP154) | inconclusive | 4 | 3 | 0 | 166 | 19 |
| `servicing-stack` (WP150; fallible WP154) | inconclusive | 4 | 3 | 0 | 400 | 31 |
| `complaints-stack` (WP150; fallible WP154, cards WP155) | not-supported | 8 | 6 | 1 | 886 | 57 |

`servicing-readers` replays Jev's recorded answers and runs one item per corpus row, so it is quick, and it needs `--config packages/packs/typesafe/craftabot.config.mjs`. A different machine gives the same effects and digests and a different wall time. CI runs the same designs at `--size 200`, and `controls`, which runs scenarios rather than a book, whole. The wall times of 2026-10-02 were taken while the machine did other work; `fraud-stack`'s doubled.
