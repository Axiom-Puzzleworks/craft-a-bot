# Timings

Full-size runs on 2026-09-11 (`craftabot experiment run --egress none --jobs 4`), one machine: Windows 11, 20 logical cores, Node from `nvm4w`. Wall time is the whole command: the population drawn, every campaign run, the reports folded.

| Experiment | Verdict | n per side (first effect) | Wall time (s) |
|---|---|---|---|
| `lending-stack` | inconclusive | 783 | 53 |
| `lending-context` | inconclusive | 783 | 48 |
| `lending-fairness` | inconclusive | 783 | 23 |
| `lending-knobs` | inconclusive | 783 | 49 |
| `fraud-stack` | inconclusive | 2912 | 155 |
| `advice-context` | not-supported | 92 | 12 |
| `human-oversight` | not-supported | 783 | 98 |

A different machine gives the same effects and digests and a different wall time. CI runs the same designs at `--size 200`.
