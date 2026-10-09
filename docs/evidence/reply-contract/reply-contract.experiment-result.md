# A reply with no tool call: what the desk does with it, against the habits the live suites measured

**Hypothesis.** The 35B answered in prose where the advice desk needed a tool call on 71% of its calls and lost 40% of its cells to it (plan 114 §2.3). Played by the scripted tier at the rates measured from the recordings (fs-bank/habit-rates), the same loss appears; a reply contract that makes the words the customer's line (say) or asks once more in the same turn (retry-with-nudge) is expected to recover it, at a stated cost in calls. The baseline is the 35B's habits with no contract; the scripted-optimal bot (no habits) and the 122B's habits (repeating the call just made) are the brain axis beside it.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (92 on the smaller side, 80% power): 18.7 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-09T21:31:33.385Z; controls —; obligations —; campaigns reply-contract--brain=habits-35b--override=none, reply-contract--brain=habits-35b--override=say, reply-contract--brain=habits-35b--override=retry-with-nudge, reply-contract--brain=scripted-optimal--override=none, reply-contract--brain=scripted-optimal--override=say, reply-contract--brain=scripted-optimal--override=retry-with-nudge, reply-contract--brain=habits-122b--override=none, reply-contract--brain=habits-122b--override=say, reply-contract--brain=habits-122b--override=retry-with-nudge. Evidence about this synthetic bank under these configurations, and nothing else.

## success

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +55.4 | +55.4 | +0.0 | -14.1 – +14.1 | 1.000 | 92 / 92 | ok |
| override | retry-with-nudge vs none | +55.4 | +95.7 | +40.2 | +28.6 – +50.7 | 0.000 | 92 / 92 | underpowered |
| override | say vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | say vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 92 pairs.

## lost

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +0.0 | +0.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +0.0 | +0.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | say vs none | +0.0 | +0.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +0.0 | +0.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | say vs none | +0.0 | +0.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +0.0 | +0.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 92 pairs.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | say vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | say vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 92 pairs.

## tokens

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | 58853.2 | 61757.8 | 2904.7 | -621.6 – 6430.9 | 0.000 | 92 / 92 | ok |
| override | retry-with-nudge vs none | 58853.2 | 76190.1 | 17336.9 | 12117.6 – 22556.2 | 0.000 | 92 / 92 | ok |
| override | say vs none | 22747.2 | 22747.2 | 0.000 | -35.4 – 35.4 | 1.000 | 92 / 92 | ok |
| override | retry-with-nudge vs none | 22747.2 | 22747.2 | 0.000 | -35.4 – 35.4 | 1.000 | 92 / 92 | ok |
| override | say vs none | 23098.3 | 23100.9 | 2.522 | -292.6 – 297.6 | 0.250 | 92 / 92 | ok |
| override | retry-with-nudge vs none | 23098.3 | 23127.7 | 29.4 | -269.1 – 327.9 | 1.000 | 92 / 92 | ok |

Method: difference of means, Welch interval at 95%; sign test over 92 non-tied of 92 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| override | say vs none (fallible tier) | 0.2354 | 0.2470 | 0.2470 | 0.0000 |
| override | retry-with-nudge vs none (fallible tier) | 0.2354 | 0.3048 | 0.3048 | 0.0000 |
| override | say vs none (scripted-optimal tier) | 0.0910 | 0.0910 | 0.0910 | 0.0000 |
| override | retry-with-nudge vs none (scripted-optimal tier) | 0.0910 | 0.0910 | 0.0910 | 0.0000 |
| override | say vs none (fallible tier) | 0.0924 | 0.0924 | 0.0924 | 0.0000 |
| override | retry-with-nudge vs none (fallible tier) | 0.0924 | 0.0925 | 0.0925 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `c4b7621930acb46781ce544a967458e564e3676cfdbc606f6c9992bb27a57a5c`.
