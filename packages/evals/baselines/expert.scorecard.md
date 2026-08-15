# Eval scorecard

Report `82a4453c-951b-4cc6-9ea8-1fe3414eb1c4` · 2026-08-15T14:30:16.503Z

**Matrix:** 1 cards × 2 brains × 1 configs × 20 seeds = **40 cells**

**Noise:** misname 12%, wasted move 12%, premature celebrate 4%

## Success rate

| Goal card                     | scripted-optimal | scripted-noisy |
| ----------------------------- | ---------------- | -------------- |
| `starter/locked-chest-expert` | 100%             | 0%             |

## Per square

| Goal card                     | Brain            | Runs | Success | Median ticks | Wasted | Loop | Naming misses | Tokens in/out |
| ----------------------------- | ---------------- | ---- | ------- | ------------ | ------ | ---- | ------------- | ------------- |
| `starter/locked-chest-expert` | scripted-noisy   | 20   | 0%      | 60           | 47%    | 4    | 23            | 66796.20/322  |
| `starter/locked-chest-expert` | scripted-optimal | 20   | 100%    | 36           | 0%     | 4    | 0             | 38134/138     |

## Against the baseline

No movement outside tolerance.
