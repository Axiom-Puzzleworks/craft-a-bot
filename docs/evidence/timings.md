# Timings

Full-size runs on 2026-10-02, the last at Phase AQ's exit (WP158, `111-…`) (`craftabot experiment run --egress none --jobs 4`; `servicing-readers` under the typesafe config, `gate-presets` under the Gate's), one machine: Windows 11, 20 logical cores, Node from `nvm4w`. Wall time is the whole command: the population drawn, every campaign run, the reports folded. Since WP116 (`103-FALLIBLE-ACTORS.md` §6) every design runs each factor under two brain tiers — its scripted tier and the fallible one — with the bank's case handler as the reviewer, so each takes about twice as long as on 2026-09-11.

| Experiment | Verdict | Effects | Untestable | Excluding zero | n per side (first effect) | Wall time (s) |
|---|---|---|---|---|---|---|
| `advice-context` | inconclusive | 8 | 4 | 2 | 92 | 58 |
| `ceilings` | inconclusive | 4 | 1 | 2 | 783 | 57 |
| `collections-stack` | inconclusive | 4 | 3 | 0 | 400 | 32 |
| `complaints-stack` | not-supported | 8 | 6 | 1 | 886 | 57 |
| `controls` | not-supported | 144 | 66 | 25 | 180 | 125 |
| `disputes-stack` | inconclusive | 4 | 3 | 0 | 300 | 53 |
| `fraud-stack` | inconclusive | 8 | 6 | 0 | 2912 | 513 |
| `gate-presets` | not-supported | 90 | 41 | 17 | 180 | 63 |
| `human-oversight` | not-supported | 36 | 15 | 19 | 783 | 298 |
| `lending-context` | inconclusive | 8 | 6 | 0 | 783 | 111 |
| `lending-fairness` | inconclusive | 4 | 2 | 0 | 783 | 53 |
| `lending-knobs` | not-supported | 8 | 4 | 2 | 783 | 119 |
| `lending-stack` | inconclusive | 12 | 6 | 2 | 783 | 133 |
| `onboarding-stack` | inconclusive | 4 | 3 | 0 | 166 | 17 |
| `servicing-readers` | not-supported | 24 | 0 | 22 | 96 | 14 |
| `servicing-stack` | inconclusive | 4 | 3 | 0 | 400 | 28 |

`servicing-readers` replays Jev's recorded answers and runs one item per corpus row, so it is quick, and it needs `--config packages/packs/typesafe/craftabot.config.mjs`. A different machine gives the same effects and digests and a different wall time. `gate-presets` needs `--config packages/gate/craftabot.config.mjs`, which installs the Gate's presets. CI runs the designs over a book at `--size 200`, and `controls` and `gate-presets`, which run scenarios, whole. WP158's run reproduced every effect of the runs before it exactly, costs included.
