# Jev on the servicing corpus v1, questions q2 — results

Recorded 2026-09-28 against `jev-1.13.0`; 95 rows (0 contested), 190 calls. Rates are counts with a Wilson 95% interval.

## The request (classify)

|            | regex                | Jev                  |
| ---------- | -------------------- | -------------------- |
| all rows   | 54% (51/95; 44–63)   | 99% (94/95; 94–100)  |
| plain      | 100% (22/22; 85–100) | 100% (22/22; 85–100) |
| paraphrase | 31% (14/45; 20–46)   | 100% (45/45; 92–100) |
| trap       | 31% (5/16; 14–56)    | 94% (15/16; 72–99)   |
| mixed      | 83% (10/12; 55–95)   | 100% (12/12; 76–100) |

**Calibration:** ECE 0.028, Brier 0.016.

| top probability | n   | mean p | accuracy             |
| --------------- | --- | ------ | -------------------- |
| 0.50–0.70       | 1   | 0.650  | 0% (0/1; 0–79)       |
| 0.70–0.80       | 4   | 0.750  | 100% (4/4; 51–100)   |
| 0.80–0.90       | 4   | 0.872  | 100% (4/4; 51–100)   |
| 0.90–0.95       | 3   | 0.920  | 100% (3/3; 44–100)   |
| 0.95–0.99       | 3   | 0.967  | 100% (3/3; 44–100)   |
| 0.99–1.00       | 80  | 0.998  | 100% (80/80; 95–100) |

**The gate** (a person reviews below the threshold; the reviewer modelled as always right):

| threshold | to a person        | accuracy of the rest | end to end           |
| --------- | ------------------ | -------------------- | -------------------- |
| 0.00      | 0% (0/95; 0–4)     | 99% (94/95; 94–100)  | 99% (94/95; 94–100)  |
| 0.60      | 1% (1/95; 0–6)     | 100% (94/94; 96–100) | 100% (95/95; 96–100) |
| 0.80      | 5% (5/95; 2–12)    | 100% (90/90; 96–100) | 100% (95/95; 96–100) |
| 0.90      | 11% (10/95; 6–18)  | 100% (85/85; 96–100) | 100% (95/95; 96–100) |
| 0.95      | 14% (13/95; 8–22)  | 100% (82/82; 96–100) | 100% (95/95; 96–100) |
| 0.99      | 19% (18/95; 12–28) | 100% (77/77; 95–100) | 100% (95/95; 96–100) |

**Confusion (rows = label, columns = pick):**

_regex_

| label \ pick | bereavement | address | card | third-party | disclosure |
| ------------ | ----------- | ------- | ---- | ----------- | ---------- |
| bereavement  | 6           | 0       | 0    | 0           | 9          |
| address      | 3           | 10      | 1    | 1           | 9          |
| card         | 1           | 0       | 11   | 1           | 7          |
| third-party  | 1           | 1       | 1    | 5           | 8          |
| disclosure   | 1           | 0       | 0    | 0           | 19         |

_Jev_

| label \ pick | bereavement | address | card | third-party | disclosure |
| ------------ | ----------- | ------- | ---- | ----------- | ---------- |
| bereavement  | 15          | 0       | 0    | 0           | 0          |
| address      | 0           | 24      | 0    | 0           | 0          |
| card         | 0           | 0       | 20   | 0           | 0          |
| third-party  | 0           | 0       | 0    | 16          | 0          |
| disclosure   | 1           | 0       | 0    | 0           | 19         |

**Rows either reader got wrong:**

| row | tag        | label       | regex       | Jev (conf.)                    | text                                                                                                           |
| --- | ---------- | ----------- | ----------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| a05 | paraphrase | address     | disclosure  | ✓ (0.99; steer 0.04)           | I've relocated to the other side of the city and want my statements going to the right place.                  |
| a06 | paraphrase | address     | disclosure  | ✓ (0.99; steer 0.04)           | We've just bought our first home, so letters should go there from now on.                                      |
| a07 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.03)           | I don't live at the old place any more; can you point the account to where I'm living now?                     |
| a08 | paraphrase | address     | disclosure  | ✓ (0.90; steer 0.03)           | I'm emigrating at the end of the month and the bank needs to know where I'll be living.                        |
| a09 | paraphrase | address     | disclosure  | ✓ (0.89; steer 0.09)           | Change of residence: I'm now living with my sister in the next town.                                           |
| a10 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.03)           | Could you update where you send my correspondence? I've been somewhere new since the spring.                   |
| a11 | paraphrase | address     | disclosure  | ✓ (0.84; steer 0.03)           | Just letting you know my home's changed; I'm in the village now, not the town.                                 |
| a12 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.07)           | Where do I tell you that I live somewhere different now?                                                       |
| a13 | trap       | address     | bereavement | ✓ (1.00; steer 0.03)           | I've moved onto a new estate and need my details updated.                                                      |
| a14 | trap       | address     | third-party | ✓ (0.98; steer 0.03)           | I can't access my post at the old house since I moved, so please update it.                                    |
| a15 | trap       | address     | bereavement | ✓ (1.00; steer 0.03)           | My phone died so I couldn't ring sooner — I've moved and need my address updated.                              |
| a16 | trap       | address     | card        | ✓ (0.94; steer 0.03)           | My card statements keep going to my old address; I moved out in the summer.                                    |
| a17 | trap       | address     | bereavement | ✓ (1.00; steer 0.03)           | The previous owner of my new house passed away, and I have moved in — please update my address.                |
| a24 | paraphrase | address     | disclosure  | ✓ (1.00; steer 0.03)           | Our family has just settled into a bigger place across town — please update our details.                       |
| c06 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.03)           | Someone pinched my wallet on the train and I need to stop the plastic and get it replaced.                     |
| c07 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.03)           | The cash machine swallowed it this morning and wouldn't give it back — I need a replacement to pay for things. |
| c08 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.02)           | My debit's snapped clean in half, can you send another?                                                        |
| c09 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.03)           | I've mislaid my contactless and need a new one sent out.                                                       |
| c10 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.03)           | The magnetic strip's worn out and shops keep declining me. I need a fresh one.                                 |
| c11 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.03)           | Somebody has been using my debit at petrol stations; I still have it but I want it stopped and replaced.       |
| c12 | paraphrase | card        | disclosure  | ✓ (1.00; steer 0.03)           | My purse was nicked at the market with my bank stuff in it and I need to stop the one for this account.        |
| c13 | trap       | card        | bereavement | ✓ (1.00; steer 0.02)           | My card died — it just won't tap any more. Can you send a new one?                                             |
| c14 | trap       | card        | third-party | ✓ (1.00; steer 0.03)           | I can't access my money because my card's been cancelled — I need a new one.                                   |
| t05 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.02)           | Could my husband be allowed to deal with the bank for me when I am away?                                       |
| t06 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.02)           | I want to give my brother authority to talk to you about my account.                                           |
| t07 | paraphrase | third-party | disclosure  | ✓ (0.99; steer 0.02)           | I'd like my accountant to be able to see my statements.                                                        |
| t08 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.03)           | Please set my daughter up as someone who can act for me on the account.                                        |
| t09 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.07)           | Can you register my son as a trusted person who can phone you for me?                                          |
| t10 | trap       | third-party | card        | ✓ (0.99; steer 0.03)           | I want my daughter to be able to do my banking — the card and everything.                                      |
| t11 | trap       | third-party | bereavement | ✓ (0.99; steer 0.02)           | My late husband's brother wants to help me with my account; can he be added?                                   |
| t12 | trap       | third-party | address     | ✓ (1.00; steer 0.03)           | I have moved my mother in with me and now look after her money — please add me to her account.                 |
| t14 | mixed      | third-party | disclosure  | ✓ (0.99; steer 0.03)           | I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly.             |
| t15 | mixed      | third-party | disclosure  | ✓ (1.00; steer 0.03)           | My eyesight's going and I'd like my niece to be able to sort out my banking for me.                            |
| t16 | paraphrase | third-party | disclosure  | ✓ (1.00; steer 0.03)           | My neighbour helps me with paperwork; can she speak to you about my account?                                   |
| b05 | paraphrase | bereavement | disclosure  | ✓ (1.00; steer 0.02)           | We lost Dad in March and I need to sort out what happens to his savings.                                       |
| b06 | paraphrase | bereavement | disclosure  | ✓ (0.99; steer 0.02)           | My wife is no longer with us and I don't know what to do about her account.                                    |
| b07 | paraphrase | bereavement | disclosure  | ✓ (0.83; steer 0.03)           | I'm dealing with my grandmother's affairs now that she's gone.                                                 |
| b08 | paraphrase | bereavement | disclosure  | ✓ (0.92; steer 0.03)           | My brother was killed in an accident and I'm handling his accounts.                                            |
| b09 | paraphrase | bereavement | disclosure  | ✓ (1.00; steer 0.03)           | Following the death of my partner, I need to close her account.                                                |
| b10 | paraphrase | bereavement | disclosure  | ✓ (0.99; steer 0.03)           | Mum's funeral was last week; the solicitor told me to ring you about her current account.                      |
| b11 | paraphrase | bereavement | disclosure  | ✓ (0.64; steer 0.03)           | I'm the administrator for my uncle's affairs after he passed.                                                  |
| b12 | paraphrase | bereavement | disclosure  | ✓ (0.98; steer 0.03)           | I'm newly widowed and our joint account needs sorting out.                                                     |
| b14 | paraphrase | bereavement | disclosure  | ✓ (1.00; steer 0.02)           | Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?                         |
| d16 | trap       | disclosure  | bereavement | bereavement (0.56; steer 0.03) | My husband died recently and I'm finding it hard to cope with the bills.                                       |

## The support need (record)

|            | regex              | Jev                  |
| ---------- | ------------------ | -------------------- |
| all rows   | 62% (59/95; 52–71) | 100% (95/95; 96–100) |
| plain      | 95% (21/22; 78–99) | 100% (22/22; 85–100) |
| paraphrase | 53% (24/45; 39–67) | 100% (45/45; 92–100) |
| trap       | 56% (9/16; 33–77)  | 100% (16/16; 81–100) |
| mixed      | 42% (5/12; 19–68)  | 100% (12/12; 76–100) |

**Calibration:** ECE 0.012, Brier 0.006.

| top probability | n   | mean p | accuracy             |
| --------------- | --- | ------ | -------------------- |
| 0.50–0.70       | 1   | 0.550  | 100% (1/1; 21–100)   |
| 0.70–0.80       | 1   | 0.790  | 100% (1/1; 21–100)   |
| 0.90–0.95       | 3   | 0.927  | 100% (3/3; 44–100)   |
| 0.95–0.99       | 6   | 0.967  | 100% (6/6; 61–100)   |
| 0.99–1.00       | 84  | 0.999  | 100% (84/84; 96–100) |

**The gate** (a person reviews below the threshold; the reviewer modelled as always right):

| threshold | to a person       | accuracy of the rest | end to end           |
| --------- | ----------------- | -------------------- | -------------------- |
| 0.00      | 0% (0/95; 0–4)    | 100% (95/95; 96–100) | 100% (95/95; 96–100) |
| 0.60      | 1% (1/95; 0–6)    | 100% (94/94; 96–100) | 100% (95/95; 96–100) |
| 0.80      | 2% (2/95; 1–7)    | 100% (93/93; 96–100) | 100% (95/95; 96–100) |
| 0.90      | 3% (3/95; 1–9)    | 100% (92/92; 96–100) | 100% (95/95; 96–100) |
| 0.95      | 5% (5/95; 2–12)   | 100% (90/90; 96–100) | 100% (95/95; 96–100) |
| 0.99      | 14% (13/95; 8–22) | 100% (82/82; 96–100) | 100% (95/95; 96–100) |

**Confusion (rows = label, columns = pick):**

_regex_

| label \ pick | none | job-loss | bereavement | health |
| ------------ | ---- | -------- | ----------- | ------ |
| none         | 43   | 0        | 3           | 3      |
| job-loss     | 7    | 5        | 0           | 0      |
| bereavement  | 12   | 0        | 7           | 0      |
| health       | 11   | 0        | 0           | 4      |

_Jev_

| label \ pick | none | job-loss | bereavement | health |
| ------------ | ---- | -------- | ----------- | ------ |
| none         | 49   | 0        | 0           | 0      |
| job-loss     | 0    | 12       | 0           | 0      |
| bereavement  | 0    | 0        | 19          | 0      |
| health       | 0    | 0        | 0           | 15     |

**Rows either reader got wrong:**

| row | tag        | label       | regex       | Jev (conf.) | text                                                                                                              |
| --- | ---------- | ----------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| a15 | trap       | none        | bereavement | ✓ (1.00)    | My phone died so I couldn't ring sooner — I've moved and need my address updated.                                 |
| a17 | trap       | none        | bereavement | ✓ (0.92)    | The previous owner of my new house passed away, and I have moved in — please update my address.                   |
| a18 | trap       | none        | health      | ✓ (0.95)    | My old job was at the hospital; I have moved house for a new one and need my address changed.                     |
| a19 | mixed      | health      | none        | ✓ (1.00)    | I've had to move into sheltered housing after my stroke, so please change my address.                             |
| a21 | mixed      | job-loss    | none        | ✓ (1.00)    | After being let go from the factory I couldn't afford the rent, so I'm somewhere cheaper now. New address please. |
| a22 | mixed      | bereavement | none        | ✓ (1.00)    | Since Mum passed I've moved into her house, so my address needs changing.                                         |
| c13 | trap       | none        | bereavement | ✓ (1.00)    | My card died — it just won't tap any more. Can you send a new one?                                                |
| c17 | mixed      | health      | none        | ✓ (1.00)    | With my dementia I keep losing things, and now my card has gone. Please send a new one.                           |
| c19 | mixed      | health      | none        | ✓ (1.00)    | My hands shake too much since the Parkinson's to use the chip and pin — can I get a card I can tap?               |
| t11 | trap       | bereavement | none        | ✓ (1.00)    | My late husband's brother wants to help me with my account; can he be added?                                      |
| t14 | mixed      | health      | none        | ✓ (0.98)    | I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly.                |
| t15 | mixed      | health      | none        | ✓ (0.99)    | My eyesight's going and I'd like my niece to be able to sort out my banking for me.                               |
| b03 | plain      | bereavement | none        | ✓ (1.00)    | I'm calling about my late husband's account.                                                                      |
| b05 | paraphrase | bereavement | none        | ✓ (1.00)    | We lost Dad in March and I need to sort out what happens to his savings.                                          |
| b06 | paraphrase | bereavement | none        | ✓ (1.00)    | My wife is no longer with us and I don't know what to do about her account.                                       |
| b07 | paraphrase | bereavement | none        | ✓ (1.00)    | I'm dealing with my grandmother's affairs now that she's gone.                                                    |
| b08 | paraphrase | bereavement | none        | ✓ (1.00)    | My brother was killed in an accident and I'm handling his accounts.                                               |
| b09 | paraphrase | bereavement | none        | ✓ (1.00)    | Following the death of my partner, I need to close her account.                                                   |
| b11 | paraphrase | bereavement | none        | ✓ (1.00)    | I'm the administrator for my uncle's affairs after he passed.                                                     |
| b12 | paraphrase | bereavement | none        | ✓ (1.00)    | I'm newly widowed and our joint account needs sorting out.                                                        |
| b14 | paraphrase | bereavement | none        | ✓ (1.00)    | Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?                            |
| d04 | paraphrase | job-loss    | none        | ✓ (0.99)    | My contract wasn't renewed and money is going to be tight for a while.                                            |
| d05 | paraphrase | job-loss    | none        | ✓ (1.00)    | The shop I worked at closed down, so I've no wages coming in.                                                     |
| d06 | paraphrase | job-loss    | none        | ✓ (1.00)    | I've been let go and I'm worried about my payments.                                                               |
| d07 | paraphrase | job-loss    | none        | ✓ (1.00)    | I've lost my income since my business went under.                                                                 |
| d08 | paraphrase | job-loss    | none        | ✓ (0.95)    | Work's dried up completely since the site closed and I'm falling behind.                                          |
| d10 | paraphrase | health      | none        | ✓ (1.00)    | I'm going through treatment for cancer and some days I can't manage phone calls.                                  |
| d11 | paraphrase | health      | none        | ✓ (1.00)    | I've got really bad anxiety and phone calls are hard, please write to me instead.                                 |
| d12 | paraphrase | health      | none        | ✓ (1.00)    | I'm registered blind, so letters in normal print are no good to me.                                               |
| d13 | paraphrase | health      | none        | ✓ (0.96)    | Just so you're aware, I'm recovering from a breakdown and might need things explained slowly.                     |
| d14 | paraphrase | health      | none        | ✓ (1.00)    | I had a stroke over the summer and my memory is not what it was.                                                  |
| d15 | paraphrase | health      | none        | ✓ (1.00)    | I'm pregnant and I've been signed off sick with complications.                                                    |
| d17 | trap       | none        | health      | ✓ (0.39)    | I'm ill with worry about my overdraft and wanted to talk to someone.                                              |
| d18 | trap       | none        | health      | ✓ (1.00)    | My health is fine, I just wanted to tell you I might be a few days late with a payment.                           |
| d19 | paraphrase | bereavement | none        | ✓ (0.86)    | We lost our baby last month and I just need you to know things might slip for a while.                            |
| d20 | paraphrase | job-loss    | none        | ✓ (1.00)    | I was sacked on Friday, so I thought you should know money will be tight.                                         |

## Vulnerability detection (any need recorded vs any need disclosed)

|       | recall               | precision            | tp / fn / fp / tn |
| ----- | -------------------- | -------------------- | ----------------- |
| regex | 35% (16/46; 23–49)   | 73% (16/22; 52–87)   | 16 / 30 / 6 / 43  |
| Jev   | 100% (46/46; 92–100) | 100% (46/46; 92–100) | 46 / 0 / 0 / 49   |

## The steer (P ≥ 0.5 against the `steer` tag)

| recall | precision | tp / fn / fp / tn |
| ------ | --------- | ----------------- |
| —      | —         | 0 / 0 / 0 / 95    |

## Latency

Per call as recorded: p50 235 ms, p95 289 ms, max 411 ms.

## Tokens and cost

Counted by TypeSafe (Jev)'s own tokenizer — not the same unit as another reader's. A case is one corpus row: two calls, the request and the need.

|         | calls | input tokens | output tokens | input per call | output per call | tokens per case |
| ------- | ----- | ------------ | ------------- | -------------- | --------------- | --------------- |
| request | 95    | 56402        | 7211          | 593.7          | 75.9            | 669.6           |
| need    | 95    | 46332        | 4610          | 487.7          | 48.5            | 536.2           |
| **all** | 190   | 102734       | 11821         | 540.7          | 62.2            | 1205.8          |

Cost at list price, docs.typesafe.ai/models (2026-09-28) ($0.042 per million input tokens, $0 per million output): $0.00431 for the corpus, $0.000045 a case, $0.0454 per thousand cases.
