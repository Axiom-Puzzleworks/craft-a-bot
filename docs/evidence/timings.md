# Timings

Full-size runs on 2026-09-29 (`craftabot experiment run --egress none --jobs 4`), one machine: Windows 11, 20 logical cores, Node from `nvm4w`. Wall time is the whole command: the population drawn, every campaign run, the reports folded. Since WP116 (`103-FALLIBLE-ACTORS.md` §6) every design runs each factor under two brain tiers — its scripted tier and the fallible one — with the bank's case handler as the reviewer, so each takes about twice as long as on 2026-09-11.

| Experiment | Verdict | Effects | Untestable | Excluding zero | n per side (first effect) | Wall time (s) |
|---|---|---|---|---|---|---|
| `lending-stack` | inconclusive | 12 | 6 | 2 | 783 | 120 |
| `lending-context` | inconclusive | 8 | 6 | 0 | 783 | 105 |
| `lending-fairness` | inconclusive | 4 | 2 | 0 | 783 | 49 |
| `lending-knobs` | not-supported | 8 | 4 | 2 | 783 | 113 |
| `fraud-stack` | inconclusive | 8 | 6 | 0 | 2912 | 321 |
| `advice-context` | not-supported | 8 | 4 | 2 | 92 | 28 |
| `human-oversight` | not-supported | 30 | 12 | 16 | 783 | 211 |

A different machine gives the same effects and digests and a different wall time. CI runs the same designs at `--size 200`.
