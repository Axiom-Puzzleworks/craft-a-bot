# Spark 122B on the servicing corpus v1, questions q2 — results

Recorded 2026-09-28 against `Qwen3.5-122B-A10B-NVFP4`; 95 rows (0 contested), 190 calls. Rates are counts with a Wilson 95% interval.

## The request (classify)

|            | regex                | Spark 122B           |
| ---------- | -------------------- | -------------------- |
| all rows   | 54% (51/95; 44–63)   | 95% (90/95; 88–98)   |
| plain      | 100% (22/22; 85–100) | 91% (20/22; 72–97)   |
| paraphrase | 31% (14/45; 20–46)   | 93% (42/45; 82–98)   |
| trap       | 31% (5/16; 14–56)    | 100% (16/16; 81–100) |
| mixed      | 83% (10/12; 55–95)   | 100% (12/12; 76–100) |

**Calibration:** ECE 0.048, Brier 0.085.

| top probability | n   | mean p | accuracy             |
| --------------- | --- | ------ | -------------------- |
| 0.00–0.50       | 1   | 0.486  | 0% (0/1; 0–79)       |
| 0.50–0.70       | 3   | 0.618  | 100% (3/3; 44–100)   |
| 0.70–0.80       | 2   | 0.739  | 50% (1/2; 9–91)      |
| 0.80–0.90       | 2   | 0.866  | 50% (1/2; 9–91)      |
| 0.90–0.95       | 2   | 0.932  | 50% (1/2; 9–91)      |
| 0.95–0.99       | 6   | 0.964  | 83% (5/6; 44–97)     |
| 0.99–1.00       | 79  | 0.999  | 100% (79/79; 95–100) |

**The gate** (a person reviews below the threshold; the reviewer modelled as always right):

| threshold | to a person        | accuracy of the rest | end to end           |
| --------- | ------------------ | -------------------- | -------------------- |
| 0.00      | 0% (0/95; 0–4)     | 95% (90/95; 88–98)   | 95% (90/95; 88–98)   |
| 0.60      | 3% (3/95; 1–9)     | 96% (88/92; 89–98)   | 96% (91/95; 90–98)   |
| 0.80      | 7% (7/95; 4–14)    | 97% (85/88; 90–99)   | 97% (92/95; 91–99)   |
| 0.90      | 9% (9/95; 5–17)    | 98% (84/86; 92–99)   | 98% (93/95; 93–99)   |
| 0.95      | 13% (12/95; 7–21)  | 100% (83/83; 96–100) | 100% (95/95; 96–100) |
| 0.99      | 18% (17/95; 11–27) | 100% (78/78; 95–100) | 100% (95/95; 96–100) |

**Confusion (rows = label, columns = pick):**

_regex_

| label \ pick | address | card | third-party | bereavement | disclosure |
| ------------ | ------- | ---- | ----------- | ----------- | ---------- |
| address      | 10      | 1    | 1           | 3           | 9          |
| card         | 0       | 11   | 1           | 1           | 7          |
| third-party  | 1       | 1    | 5           | 1           | 8          |
| bereavement  | 0       | 0    | 0           | 6           | 9          |
| disclosure   | 0       | 0    | 0           | 1           | 19         |

_Spark 122B_

| label \ pick | address | card | third-party | bereavement | disclosure |
| ------------ | ------- | ---- | ----------- | ----------- | ---------- |
| address      | 23      | 0    | 0           | 0           | 1          |
| card         | 0       | 20   | 0           | 0           | 0          |
| third-party  | 0       | 0    | 16          | 0           | 0          |
| bereavement  | 0       | 0    | 0           | 11          | 4          |
| disclosure   | 0       | 0    | 0           | 0           | 20         |

**Rows either reader got wrong:**

| row | tag        | label       | regex       | Spark 122B (conf.)            | text                                                                                                           |
| --- | ---------- | ----------- | ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| a05 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.00)          | I've relocated to the other side of the city and want my statements going to the right place.                  |
| a06 | paraphrase | address     | disclosure  | ✓ (0.99; steer 0.01)          | We've just bought our first home, so letters should go there from now on.                                      |
| a07 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.00)          | I don't live at the old place any more; can you point the account to where I'm living now?                     |
| a08 | paraphrase | address     | disclosure  | ✓ (0.52; steer 0.00)          | I'm emigrating at the end of the month and the bank needs to know where I'll be living.                        |
| a09 | paraphrase | address     | disclosure  | ✓ (0.99; steer 0.00)          | Change of residence: I'm now living with my sister in the next town.                                           |
| a10 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.00)          | Could you update where you send my correspondence? I've been somewhere new since the spring.                   |
| a11 | paraphrase | address     | disclosure  | ✓ (0.44; steer 0.00)          | Just letting you know my home's changed; I'm in the village now, not the town.                                 |
| a12 | paraphrase | address     | disclosure  | disclosure (0.87; steer 0.01) | Where do I tell you that I live somewhere different now?                                                       |
| a13 | trap       | address     | bereavement | ✓ (1.00; steer 0.00)          | I've moved onto a new estate and need my details updated.                                                      |
| a14 | trap       | address     | third-party | ✓ (0.99; steer 0.01)          | I can't access my post at the old house since I moved, so please update it.                                    |
| a15 | trap       | address     | bereavement | ✓ (1.00; steer 0.00)          | My phone died so I couldn't ring sooner — I've moved and need my address updated.                              |
| a16 | trap       | address     | card        | ✓ (1.00; steer 0.00)          | My card statements keep going to my old address; I moved out in the summer.                                    |
| a17 | trap       | address     | bereavement | ✓ (0.96; steer 0.01)          | The previous owner of my new house passed away, and I have moved in — please update my address.                |
| a24 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.01)          | Our family has just settled into a bigger place across town — please update our details.                       |
| c06 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | Someone pinched my wallet on the train and I need to stop the plastic and get it replaced.                     |
| c07 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | The cash machine swallowed it this morning and wouldn't give it back — I need a replacement to pay for things. |
| c08 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | My debit's snapped clean in half, can you send another?                                                        |
| c09 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | I've mislaid my contactless and need a new one sent out.                                                       |
| c10 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | The magnetic strip's worn out and shops keep declining me. I need a fresh one.                                 |
| c11 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | Somebody has been using my debit at petrol stations; I still have it but I want it stopped and replaced.       |
| c12 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.00)          | My purse was nicked at the market with my bank stuff in it and I need to stop the one for this account.        |
| c13 | trap       | card        | bereavement | ✓ (1.00; steer 0.00)          | My card died — it just won't tap any more. Can you send a new one?                                             |
| c14 | trap       | card        | third-party | ✓ (1.00; steer 0.00)          | I can't access my money because my card's been cancelled — I need a new one.                                   |
| t05 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.00)          | Could my husband be allowed to deal with the bank for me when I am away?                                       |
| t06 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.01)          | I want to give my brother authority to talk to you about my account.                                           |
| t07 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.00)          | I'd like my accountant to be able to see my statements.                                                        |
| t08 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.00)          | Please set my daughter up as someone who can act for me on the account.                                        |
| t09 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.03)          | Can you register my son as a trusted person who can phone you for me?                                          |
| t10 | trap       | third-party | card        | ✓ (1.00; steer 0.00)          | I want my daughter to be able to do my banking — the card and everything.                                      |
| t11 | trap       | third-party | bereavement | ✓ (1.00; steer 0.00)          | My late husband's brother wants to help me with my account; can he be added?                                   |
| t12 | trap       | third-party | address     | ✓ (1.00; steer 0.02)          | I have moved my mother in with me and now look after her money — please add me to her account.                 |
| t14 | mixed      | third-party | disclosure  | ✓ (1.00; steer 0.00)          | I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly.             |
| t15 | mixed      | third-party | disclosure  | ✓ (1.00; steer 0.00)          | My eyesight's going and I'd like my niece to be able to sort out my banking for me.                            |
| t16 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.00)          | My neighbour helps me with paperwork; can she speak to you about my account?                                   |
| b02 | plain      | bereavement | ✓           | disclosure (0.94; steer 0.00) | My father died and I'm the executor of his estate.                                                             |
| b05 | paraphrase | bereavement | disclosure  | ✓ (1.00; steer 0.00)          | We lost Dad in March and I need to sort out what happens to his savings.                                       |
| b06 | paraphrase | bereavement | disclosure  | ✓ (0.99; steer 0.00)          | My wife is no longer with us and I don't know what to do about her account.                                    |
| b07 | paraphrase | bereavement | disclosure  | disclosure (0.36; steer 0.00) | I'm dealing with my grandmother's affairs now that she's gone.                                                 |
| b08 | paraphrase | bereavement | disclosure  | ✓ (0.66; steer 0.00)          | My brother was killed in an accident and I'm handling his accounts.                                            |
| b09 | paraphrase | bereavement | disclosure  | ✓ (0.99; steer 0.00)          | Following the death of my partner, I need to close her account.                                                |
| b10 | paraphrase | bereavement | disclosure  | ✓ (0.61; steer 0.00)          | Mum's funeral was last week; the solicitor told me to ring you about her current account.                      |
| b11 | paraphrase | bereavement | disclosure  | disclosure (0.69; steer 0.00) | I'm the administrator for my uncle's affairs after he passed.                                                  |
| b12 | paraphrase | bereavement | disclosure  | ✓ (0.95; steer 0.00)          | I'm newly widowed and our joint account needs sorting out.                                                     |
| b13 | plain      | bereavement | ✓           | disclosure (0.93; steer 0.04) | I need to let you know my aunt has sadly died and I am her next of kin.                                        |
| b14 | paraphrase | bereavement | disclosure  | ✓ (1.00; steer 0.00)          | Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?                         |
| d16 | trap       | disclosure  | bereavement | ✓ (0.79; steer 0.00)          | My husband died recently and I'm finding it hard to cope with the bills.                                       |

## The support need (record)

|            | regex              | Spark 122B           |
| ---------- | ------------------ | -------------------- |
| all rows   | 62% (59/95; 52–71) | 98% (93/95; 93–99)   |
| plain      | 95% (21/22; 78–99) | 100% (22/22; 85–100) |
| paraphrase | 53% (24/45; 39–67) | 100% (45/45; 92–100) |
| trap       | 56% (9/16; 33–77)  | 94% (15/16; 72–99)   |
| mixed      | 42% (5/12; 19–68)  | 92% (11/12; 65–99)   |

**Calibration:** ECE 0.012, Brier 0.021.

| top probability | n   | mean p | accuracy             |
| --------------- | --- | ------ | -------------------- |
| 0.50–0.70       | 3   | 0.586  | 33% (1/3; 6–79)      |
| 0.80–0.90       | 2   | 0.838  | 100% (2/2; 34–100)   |
| 0.95–0.99       | 3   | 0.988  | 100% (3/3; 44–100)   |
| 0.99–1.00       | 87  | 0.999  | 100% (87/87; 96–100) |

**The gate** (a person reviews below the threshold; the reviewer modelled as always right):

| threshold | to a person     | accuracy of the rest | end to end           |
| --------- | --------------- | -------------------- | -------------------- |
| 0.00      | 0% (0/95; 0–4)  | 98% (93/95; 93–99)   | 98% (93/95; 93–99)   |
| 0.60      | 3% (3/95; 1–9)  | 100% (92/92; 96–100) | 100% (95/95; 96–100) |
| 0.80      | 5% (5/95; 2–12) | 100% (90/90; 96–100) | 100% (95/95; 96–100) |
| 0.90      | 5% (5/95; 2–12) | 100% (90/90; 96–100) | 100% (95/95; 96–100) |
| 0.95      | 5% (5/95; 2–12) | 100% (90/90; 96–100) | 100% (95/95; 96–100) |
| 0.99      | 8% (8/95; 4–16) | 100% (87/87; 96–100) | 100% (95/95; 96–100) |

**Confusion (rows = label, columns = pick):**

_regex_

| label \ pick | job-loss | bereavement | health | none |
| ------------ | -------- | ----------- | ------ | ---- |
| job-loss     | 5        | 0           | 0      | 7    |
| bereavement  | 0        | 7           | 0      | 12   |
| health       | 0        | 0           | 4      | 11   |
| none         | 0        | 3           | 3      | 43   |

_Spark 122B_

| label \ pick | job-loss | bereavement | health | none |
| ------------ | -------- | ----------- | ------ | ---- |
| job-loss     | 12       | 0           | 0      | 0    |
| bereavement  | 0        | 19          | 0      | 0    |
| health       | 0        | 0           | 14     | 1    |
| none         | 0        | 1           | 0      | 48   |

**Rows either reader got wrong:**

| row | tag        | label       | regex       | Spark 122B (conf.) | text                                                                                                              |
| --- | ---------- | ----------- | ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| a15 | trap       | none        | bereavement | ✓ (1.00)           | My phone died so I couldn't ring sooner — I've moved and need my address updated.                                 |
| a17 | trap       | none        | bereavement | bereavement (0.54) | The previous owner of my new house passed away, and I have moved in — please update my address.                   |
| a18 | trap       | none        | health      | ✓ (0.98)           | My old job was at the hospital; I have moved house for a new one and need my address changed.                     |
| a19 | mixed      | health      | none        | ✓ (1.00)           | I've had to move into sheltered housing after my stroke, so please change my address.                             |
| a21 | mixed      | job-loss    | none        | ✓ (1.00)           | After being let go from the factory I couldn't afford the rent, so I'm somewhere cheaper now. New address please. |
| a22 | mixed      | bereavement | none        | ✓ (0.99)           | Since Mum passed I've moved into her house, so my address needs changing.                                         |
| c13 | trap       | none        | bereavement | ✓ (1.00)           | My card died — it just won't tap any more. Can you send a new one?                                                |
| c16 | mixed      | health      | ✓           | none (0.36)        | I'm in hospital and my card's gone missing from the ward — can you replace it?                                    |
| c17 | mixed      | health      | none        | ✓ (1.00)           | With my dementia I keep losing things, and now my card has gone. Please send a new one.                           |
| c19 | mixed      | health      | none        | ✓ (1.00)           | My hands shake too much since the Parkinson's to use the chip and pin — can I get a card I can tap?               |
| t11 | trap       | bereavement | none        | ✓ (0.44)           | My late husband's brother wants to help me with my account; can he be added?                                      |
| t14 | mixed      | health      | none        | ✓ (1.00)           | I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly.                |
| t15 | mixed      | health      | none        | ✓ (0.80)           | My eyesight's going and I'd like my niece to be able to sort out my banking for me.                               |
| b03 | plain      | bereavement | none        | ✓ (1.00)           | I'm calling about my late husband's account.                                                                      |
| b05 | paraphrase | bereavement | none        | ✓ (1.00)           | We lost Dad in March and I need to sort out what happens to his savings.                                          |
| b06 | paraphrase | bereavement | none        | ✓ (1.00)           | My wife is no longer with us and I don't know what to do about her account.                                       |
| b07 | paraphrase | bereavement | none        | ✓ (1.00)           | I'm dealing with my grandmother's affairs now that she's gone.                                                    |
| b08 | paraphrase | bereavement | none        | ✓ (1.00)           | My brother was killed in an accident and I'm handling his accounts.                                               |
| b09 | paraphrase | bereavement | none        | ✓ (1.00)           | Following the death of my partner, I need to close her account.                                                   |
| b11 | paraphrase | bereavement | none        | ✓ (1.00)           | I'm the administrator for my uncle's affairs after he passed.                                                     |
| b12 | paraphrase | bereavement | none        | ✓ (1.00)           | I'm newly widowed and our joint account needs sorting out.                                                        |
| b14 | paraphrase | bereavement | none        | ✓ (1.00)           | Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?                            |
| d04 | paraphrase | job-loss    | none        | ✓ (0.99)           | My contract wasn't renewed and money is going to be tight for a while.                                            |
| d05 | paraphrase | job-loss    | none        | ✓ (1.00)           | The shop I worked at closed down, so I've no wages coming in.                                                     |
| d06 | paraphrase | job-loss    | none        | ✓ (1.00)           | I've been let go and I'm worried about my payments.                                                               |
| d07 | paraphrase | job-loss    | none        | ✓ (1.00)           | I've lost my income since my business went under.                                                                 |
| d08 | paraphrase | job-loss    | none        | ✓ (0.98)           | Work's dried up completely since the site closed and I'm falling behind.                                          |
| d10 | paraphrase | health      | none        | ✓ (1.00)           | I'm going through treatment for cancer and some days I can't manage phone calls.                                  |
| d11 | paraphrase | health      | none        | ✓ (1.00)           | I've got really bad anxiety and phone calls are hard, please write to me instead.                                 |
| d12 | paraphrase | health      | none        | ✓ (1.00)           | I'm registered blind, so letters in normal print are no good to me.                                               |
| d13 | paraphrase | health      | none        | ✓ (1.00)           | Just so you're aware, I'm recovering from a breakdown and might need things explained slowly.                     |
| d14 | paraphrase | health      | none        | ✓ (1.00)           | I had a stroke over the summer and my memory is not what it was.                                                  |
| d15 | paraphrase | health      | none        | ✓ (0.99)           | I'm pregnant and I've been signed off sick with complications.                                                    |
| d17 | trap       | none        | health      | ✓ (0.77)           | I'm ill with worry about my overdraft and wanted to talk to someone.                                              |
| d18 | trap       | none        | health      | ✓ (1.00)           | My health is fine, I just wanted to tell you I might be a few days late with a payment.                           |
| d19 | paraphrase | bereavement | none        | ✓ (1.00)           | We lost our baby last month and I just need you to know things might slip for a while.                            |
| d20 | paraphrase | job-loss    | none        | ✓ (1.00)           | I was sacked on Friday, so I thought you should know money will be tight.                                         |

## Vulnerability detection (any need recorded vs any need disclosed)

|            | recall              | precision           | tp / fn / fp / tn |
| ---------- | ------------------- | ------------------- | ----------------- |
| regex      | 35% (16/46; 23–49)  | 73% (16/22; 52–87)  | 16 / 30 / 6 / 43  |
| Spark 122B | 98% (45/46; 89–100) | 98% (45/46; 89–100) | 45 / 1 / 1 / 48   |

## The steer (P ≥ 0.5 against the `steer` tag)

| recall | precision | tp / fn / fp / tn |
| ------ | --------- | ----------------- |
| —      | —         | 0 / 0 / 0 / 95    |

## Latency

Per call as recorded: p50 1070 ms, p95 1103 ms, max 1214 ms.

## Tokens and cost

Counted by Qwen (vLLM, the Spark)'s own tokenizer — not the same unit as another reader's. A case is one corpus row: two calls, the request and the need.

|         | calls | input tokens | output tokens | input per call | output per call | tokens per case |
| ------- | ----- | ------------ | ------------- | -------------- | --------------- | --------------- |
| request | 95    | 37748        | 443           | 397.3          | 4.7             | 402.0           |
| need    | 95    | 22294        | 242           | 234.7          | 2.5             | 237.2           |
| **all** | 190   | 60042        | 685           | 316.0          | 3.6             | 639.2           |

No per-token price: the Spark is the builder’s own hardware. Set SPARK_INPUT_USD_PER_MTOK / SPARK_OUTPUT_USD_PER_MTOK to cost the same tokens at a stated what-if rate.
