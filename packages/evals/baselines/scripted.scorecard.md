# Eval scorecard

Report `737887d9-82ea-4dcd-adfd-f5f25c7210f2` · 2026-08-15T14:32:46.517Z

**Matrix:** 6 cards × 2 brains × 1 configs × 20 seeds = **240 cells**

**Noise:** misname 12%, wasted move 12%, premature celebrate 4%

## Success rate

| Goal card | scripted-optimal | scripted-noisy |
|---|---|---|
| `starter/say-hello` | 100% | 80% |
| `starter/snack` | 100% | 45% |
| `starter/tidy-the-blocks` | 100% | 20% |
| `starter/locked-chest` | 100% | 15% |
| `starter/sums-for-teddy` | 100% | 100% |
| `starter/free-play` | 100% | 100% |

## Per square

| Goal card | Brain | Runs | Success | Median ticks | Wasted | Loop | Naming misses | Tokens in/out |
|---|---|---|---|---|---|---|---|---|
| `starter/free-play` | scripted-noisy | 20 | 100% | 1 | 0% | 1 | 0 | 333.60/11.70 |
| `starter/free-play` | scripted-optimal | 20 | 100% | 1 | 0% | 1 | 0 | 295/11 |
| `starter/locked-chest` | scripted-noisy | 20 | 15% | 30 | 46% | 2 | 13 | 29029.65/184.45 |
| `starter/locked-chest` | scripted-optimal | 20 | 100% | 13 | 0% | 2 | 0 | 10828/69 |
| `starter/say-hello` | scripted-noisy | 20 | 80% | 5 | 16% | 3 | 0 | 6659.20/63.45 |
| `starter/say-hello` | scripted-optimal | 20 | 100% | 4 | 0% | 3 | 0 | 1652/19 |
| `starter/snack` | scripted-noisy | 20 | 45% | 30 | 41% | 2 | 6 | 17578.55/139.45 |
| `starter/snack` | scripted-optimal | 20 | 100% | 7 | 0% | 2 | 0 | 3883/38 |
| `starter/sums-for-teddy` | scripted-noisy | 20 | 100% | 2 | 3% | 1 | 0 | 943.45/17.55 |
| `starter/sums-for-teddy` | scripted-optimal | 20 | 100% | 2 | 0% | 1 | 0 | 697/14 |
| `starter/tidy-the-blocks` | scripted-noisy | 20 | 20% | 30 | 52% | 2 | 12 | 25700.30/167.15 |
| `starter/tidy-the-blocks` | scripted-optimal | 20 | 100% | 10 | 0% | 2 | 0 | 6920/42 |

## Against the baseline

No movement outside tolerance.
