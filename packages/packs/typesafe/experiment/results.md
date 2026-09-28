# Jev on the servicing corpus v1, questions q1 — results

Recorded 2026-09-28 against `jev-1.13.0`; 95 rows (0 contested), 190 calls. Rates are counts with a Wilson 95% interval.

## The request (classify)

|            | regex                | Jev                  |
| ---------- | -------------------- | -------------------- |
| all rows   | 54% (51/95; 44–63)   | 99% (94/95; 94–100)  |
| plain      | 100% (22/22; 85–100) | 100% (22/22; 85–100) |
| paraphrase | 31% (14/45; 20–46)   | 100% (45/45; 92–100) |
| trap       | 31% (5/16; 14–56)    | 94% (15/16; 72–99)   |
| mixed      | 83% (10/12; 55–95)   | 100% (12/12; 76–100) |

**Calibration:** ECE 0.023, Brier 0.014.

| top probability | n   | mean p | accuracy             |
| --------------- | --- | ------ | -------------------- |
| 0.50–0.70       | 1   | 0.690  | 0% (0/1; 0–79)       |
| 0.70–0.80       | 1   | 0.760  | 100% (1/1; 21–100)   |
| 0.80–0.90       | 4   | 0.858  | 100% (4/4; 51–100)   |
| 0.90–0.95       | 5   | 0.924  | 100% (5/5; 57–100)   |
| 0.95–0.99       | 6   | 0.975  | 100% (6/6; 61–100)   |
| 0.99–1.00       | 78  | 0.999  | 100% (78/78; 95–100) |

**The gate** (a person reviews below the threshold; the reviewer modelled as always right):

| threshold | to a person        | accuracy of the rest | end to end           |
| --------- | ------------------ | -------------------- | -------------------- |
| 0.00      | 0% (0/95; 0–4)     | 99% (94/95; 94–100)  | 99% (94/95; 94–100)  |
| 0.60      | 0% (0/95; 0–4)     | 99% (94/95; 94–100)  | 99% (94/95; 94–100)  |
| 0.80      | 2% (2/95; 1–7)     | 100% (93/93; 96–100) | 100% (95/95; 96–100) |
| 0.90      | 7% (7/95; 4–14)    | 100% (88/88; 96–100) | 100% (95/95; 96–100) |
| 0.95      | 13% (12/95; 7–21)  | 100% (83/83; 96–100) | 100% (95/95; 96–100) |
| 0.99      | 22% (21/95; 15–31) | 100% (74/74; 95–100) | 100% (95/95; 96–100) |

**Confusion (rows = label, columns = pick):**

_regex_

| label \ pick | third-party | card | disclosure | address | bereavement |
| ------------ | ----------- | ---- | ---------- | ------- | ----------- |
| third-party  | 5           | 1    | 8          | 1       | 1           |
| card         | 1           | 11   | 7          | 0       | 1           |
| disclosure   | 0           | 0    | 19         | 0       | 1           |
| address      | 1           | 1    | 9          | 10      | 3           |
| bereavement  | 0           | 0    | 9          | 0       | 6           |

_Jev_

| label \ pick | third-party | card | disclosure | address | bereavement |
| ------------ | ----------- | ---- | ---------- | ------- | ----------- |
| third-party  | 16          | 0    | 0          | 0       | 0           |
| card         | 0           | 20   | 0          | 0       | 0           |
| disclosure   | 0           | 0    | 19         | 0       | 1           |
| address      | 0           | 0    | 0          | 24      | 0           |
| bereavement  | 0           | 0    | 0          | 0       | 15          |

**Rows either reader got wrong:**

| row | tag        | label       | regex       | Jev (conf.)        | text                                                                                                           |
| --- | ---------- | ----------- | ----------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| a05 | paraphrase | address     | disclosure  | ✓ (0.99)           | I've relocated to the other side of the city and want my statements going to the right place.                  |
| a06 | paraphrase | address     | disclosure  | ✓ (0.99)           | We've just bought our first home, so letters should go there from now on.                                      |
| a07 | paraphrase | address     | disclosure  | ✓ (1.00)           | I don't live at the old place any more; can you point the account to where I'm living now?                     |
| a08 | paraphrase | address     | disclosure  | ✓ (0.91)           | I'm emigrating at the end of the month and the bank needs to know where I'll be living.                        |
| a09 | paraphrase | address     | disclosure  | ✓ (0.92)           | Change of residence: I'm now living with my sister in the next town.                                           |
| a10 | paraphrase | address     | disclosure  | ✓ (1.00)           | Could you update where you send my correspondence? I've been somewhere new since the spring.                   |
| a11 | paraphrase | address     | disclosure  | ✓ (0.83)           | Just letting you know my home's changed; I'm in the village now, not the town.                                 |
| a12 | paraphrase | address     | disclosure  | ✓ (0.99)           | Where do I tell you that I live somewhere different now?                                                       |
| a13 | trap       | address     | bereavement | ✓ (1.00)           | I've moved onto a new estate and need my details updated.                                                      |
| a14 | trap       | address     | third-party | ✓ (0.98)           | I can't access my post at the old house since I moved, so please update it.                                    |
| a15 | trap       | address     | bereavement | ✓ (1.00)           | My phone died so I couldn't ring sooner — I've moved and need my address updated.                              |
| a16 | trap       | address     | card        | ✓ (0.99)           | My card statements keep going to my old address; I moved out in the summer.                                    |
| a17 | trap       | address     | bereavement | ✓ (1.00)           | The previous owner of my new house passed away, and I have moved in — please update my address.                |
| a24 | paraphrase | address     | disclosure  | ✓ (1.00)           | Our family has just settled into a bigger place across town — please update our details.                       |
| c06 | paraphrase | card        | disclosure  | ✓ (1.00)           | Someone pinched my wallet on the train and I need to stop the plastic and get it replaced.                     |
| c07 | paraphrase | card        | disclosure  | ✓ (1.00)           | The cash machine swallowed it this morning and wouldn't give it back — I need a replacement to pay for things. |
| c08 | paraphrase | card        | disclosure  | ✓ (1.00)           | My debit's snapped clean in half, can you send another?                                                        |
| c09 | paraphrase | card        | disclosure  | ✓ (1.00)           | I've mislaid my contactless and need a new one sent out.                                                       |
| c10 | paraphrase | card        | disclosure  | ✓ (1.00)           | The magnetic strip's worn out and shops keep declining me. I need a fresh one.                                 |
| c11 | paraphrase | card        | disclosure  | ✓ (1.00)           | Somebody has been using my debit at petrol stations; I still have it but I want it stopped and replaced.       |
| c12 | paraphrase | card        | disclosure  | ✓ (1.00)           | My purse was nicked at the market with my bank stuff in it and I need to stop the one for this account.        |
| c13 | trap       | card        | bereavement | ✓ (1.00)           | My card died — it just won't tap any more. Can you send a new one?                                             |
| c14 | trap       | card        | third-party | ✓ (1.00)           | I can't access my money because my card's been cancelled — I need a new one.                                   |
| t05 | paraphrase | third-party | disclosure  | ✓ (1.00)           | Could my husband be allowed to deal with the bank for me when I am away?                                       |
| t06 | paraphrase | third-party | disclosure  | ✓ (1.00)           | I want to give my brother authority to talk to you about my account.                                           |
| t07 | paraphrase | third-party | disclosure  | ✓ (0.98)           | I'd like my accountant to be able to see my statements.                                                        |
| t08 | paraphrase | third-party | disclosure  | ✓ (1.00)           | Please set my daughter up as someone who can act for me on the account.                                        |
| t09 | paraphrase | third-party | disclosure  | ✓ (1.00)           | Can you register my son as a trusted person who can phone you for me?                                          |
| t10 | trap       | third-party | card        | ✓ (1.00)           | I want my daughter to be able to do my banking — the card and everything.                                      |
| t11 | trap       | third-party | bereavement | ✓ (0.98)           | My late husband's brother wants to help me with my account; can he be added?                                   |
| t12 | trap       | third-party | address     | ✓ (1.00)           | I have moved my mother in with me and now look after her money — please add me to her account.                 |
| t14 | mixed      | third-party | disclosure  | ✓ (1.00)           | I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly.             |
| t15 | mixed      | third-party | disclosure  | ✓ (1.00)           | My eyesight's going and I'd like my niece to be able to sort out my banking for me.                            |
| t16 | paraphrase | third-party | disclosure  | ✓ (1.00)           | My neighbour helps me with paperwork; can she speak to you about my account?                                   |
| b05 | paraphrase | bereavement | disclosure  | ✓ (1.00)           | We lost Dad in March and I need to sort out what happens to his savings.                                       |
| b06 | paraphrase | bereavement | disclosure  | ✓ (0.99)           | My wife is no longer with us and I don't know what to do about her account.                                    |
| b07 | paraphrase | bereavement | disclosure  | ✓ (0.91)           | I'm dealing with my grandmother's affairs now that she's gone.                                                 |
| b08 | paraphrase | bereavement | disclosure  | ✓ (0.94)           | My brother was killed in an accident and I'm handling his accounts.                                            |
| b09 | paraphrase | bereavement | disclosure  | ✓ (1.00)           | Following the death of my partner, I need to close her account.                                                |
| b10 | paraphrase | bereavement | disclosure  | ✓ (0.99)           | Mum's funeral was last week; the solicitor told me to ring you about her current account.                      |
| b11 | paraphrase | bereavement | disclosure  | ✓ (0.81)           | I'm the administrator for my uncle's affairs after he passed.                                                  |
| b12 | paraphrase | bereavement | disclosure  | ✓ (0.98)           | I'm newly widowed and our joint account needs sorting out.                                                     |
| b14 | paraphrase | bereavement | disclosure  | ✓ (1.00)           | Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?                         |
| d16 | trap       | disclosure  | bereavement | bereavement (0.61) | My husband died recently and I'm finding it hard to cope with the bills.                                       |

## The support need (record)

|            | regex              | Jev                  |
| ---------- | ------------------ | -------------------- |
| all rows   | 62% (59/95; 52–71) | 98% (93/95; 93–99)   |
| plain      | 95% (21/22; 78–99) | 100% (22/22; 85–100) |
| paraphrase | 53% (24/45; 39–67) | 100% (45/45; 92–100) |
| trap       | 56% (9/16; 33–77)  | 88% (14/16; 64–97)   |
| mixed      | 42% (5/12; 19–68)  | 100% (12/12; 76–100) |

**Calibration:** ECE 0.014, Brier 0.022.

| top probability | n   | mean p | accuracy             |
| --------------- | --- | ------ | -------------------- |
| 0.50–0.70       | 1   | 0.660  | 0% (0/1; 0–79)       |
| 0.70–0.80       | 2   | 0.740  | 50% (1/2; 9–91)      |
| 0.95–0.99       | 6   | 0.972  | 100% (6/6; 61–100)   |
| 0.99–1.00       | 86  | 1.000  | 100% (86/86; 96–100) |

**The gate** (a person reviews below the threshold; the reviewer modelled as always right):

| threshold | to a person       | accuracy of the rest | end to end           |
| --------- | ----------------- | -------------------- | -------------------- |
| 0.00      | 0% (0/95; 0–4)    | 98% (93/95; 93–99)   | 98% (93/95; 93–99)   |
| 0.60      | 1% (1/95; 0–6)    | 99% (93/94; 94–100)  | 99% (94/95; 94–100)  |
| 0.80      | 3% (3/95; 1–9)    | 100% (92/92; 96–100) | 100% (95/95; 96–100) |
| 0.90      | 3% (3/95; 1–9)    | 100% (92/92; 96–100) | 100% (95/95; 96–100) |
| 0.95      | 4% (4/95; 2–10)   | 100% (91/91; 96–100) | 100% (95/95; 96–100) |
| 0.99      | 11% (10/95; 6–18) | 100% (85/85; 96–100) | 100% (95/95; 96–100) |

**Confusion (rows = label, columns = pick):**

_regex_

| label \ pick | health | job-loss | bereavement | none |
| ------------ | ------ | -------- | ----------- | ---- |
| health       | 4      | 0        | 0           | 11   |
| job-loss     | 0      | 5        | 0           | 7    |
| bereavement  | 0      | 0        | 7           | 12   |
| none         | 3      | 0        | 3           | 43   |

_Jev_

| label \ pick | health | job-loss | bereavement | none |
| ------------ | ------ | -------- | ----------- | ---- |
| health       | 15     | 0        | 0           | 0    |
| job-loss     | 0      | 12       | 0           | 0    |
| bereavement  | 0      | 0        | 19          | 0    |
| none         | 1      | 0        | 1           | 47   |

**Rows either reader got wrong:**

| row | tag        | label       | regex       | Jev (conf.)        | text                                                                                                              |
| --- | ---------- | ----------- | ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| a15 | trap       | none        | bereavement | ✓ (1.00)           | My phone died so I couldn't ring sooner — I've moved and need my address updated.                                 |
| a17 | trap       | none        | bereavement | bereavement (0.64) | The previous owner of my new house passed away, and I have moved in — please update my address.                   |
| a18 | trap       | none        | health      | ✓ (0.98)           | My old job was at the hospital; I have moved house for a new one and need my address changed.                     |
| a19 | mixed      | health      | none        | ✓ (1.00)           | I've had to move into sheltered housing after my stroke, so please change my address.                             |
| a21 | mixed      | job-loss    | none        | ✓ (1.00)           | After being let go from the factory I couldn't afford the rent, so I'm somewhere cheaper now. New address please. |
| a22 | mixed      | bereavement | none        | ✓ (1.00)           | Since Mum passed I've moved into her house, so my address needs changing.                                         |
| c13 | trap       | none        | bereavement | ✓ (1.00)           | My card died — it just won't tap any more. Can you send a new one?                                                |
| c17 | mixed      | health      | none        | ✓ (1.00)           | With my dementia I keep losing things, and now my card has gone. Please send a new one.                           |
| c19 | mixed      | health      | none        | ✓ (1.00)           | My hands shake too much since the Parkinson's to use the chip and pin — can I get a card I can tap?               |
| t11 | trap       | bereavement | none        | ✓ (1.00)           | My late husband's brother wants to help me with my account; can he be added?                                      |
| t14 | mixed      | health      | none        | ✓ (1.00)           | I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly.                |
| t15 | mixed      | health      | none        | ✓ (1.00)           | My eyesight's going and I'd like my niece to be able to sort out my banking for me.                               |
| b03 | plain      | bereavement | none        | ✓ (1.00)           | I'm calling about my late husband's account.                                                                      |
| b05 | paraphrase | bereavement | none        | ✓ (1.00)           | We lost Dad in March and I need to sort out what happens to his savings.                                          |
| b06 | paraphrase | bereavement | none        | ✓ (1.00)           | My wife is no longer with us and I don't know what to do about her account.                                       |
| b07 | paraphrase | bereavement | none        | ✓ (1.00)           | I'm dealing with my grandmother's affairs now that she's gone.                                                    |
| b08 | paraphrase | bereavement | none        | ✓ (1.00)           | My brother was killed in an accident and I'm handling his accounts.                                               |
| b09 | paraphrase | bereavement | none        | ✓ (1.00)           | Following the death of my partner, I need to close her account.                                                   |
| b11 | paraphrase | bereavement | none        | ✓ (1.00)           | I'm the administrator for my uncle's affairs after he passed.                                                     |
| b12 | paraphrase | bereavement | none        | ✓ (1.00)           | I'm newly widowed and our joint account needs sorting out.                                                        |
| b14 | paraphrase | bereavement | none        | ✓ (1.00)           | Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?                            |
| d04 | paraphrase | job-loss    | none        | ✓ (1.00)           | My contract wasn't renewed and money is going to be tight for a while.                                            |
| d05 | paraphrase | job-loss    | none        | ✓ (1.00)           | The shop I worked at closed down, so I've no wages coming in.                                                     |
| d06 | paraphrase | job-loss    | none        | ✓ (1.00)           | I've been let go and I'm worried about my payments.                                                               |
| d07 | paraphrase | job-loss    | none        | ✓ (1.00)           | I've lost my income since my business went under.                                                                 |
| d08 | paraphrase | job-loss    | none        | ✓ (0.99)           | Work's dried up completely since the site closed and I'm falling behind.                                          |
| d10 | paraphrase | health      | none        | ✓ (1.00)           | I'm going through treatment for cancer and some days I can't manage phone calls.                                  |
| d11 | paraphrase | health      | none        | ✓ (1.00)           | I've got really bad anxiety and phone calls are hard, please write to me instead.                                 |
| d12 | paraphrase | health      | none        | ✓ (1.00)           | I'm registered blind, so letters in normal print are no good to me.                                               |
| d13 | paraphrase | health      | none        | ✓ (1.00)           | Just so you're aware, I'm recovering from a breakdown and might need things explained slowly.                     |
| d14 | paraphrase | health      | none        | ✓ (1.00)           | I had a stroke over the summer and my memory is not what it was.                                                  |
| d15 | paraphrase | health      | none        | ✓ (1.00)           | I'm pregnant and I've been signed off sick with complications.                                                    |
| d17 | trap       | none        | health      | health (0.55)      | I'm ill with worry about my overdraft and wanted to talk to someone.                                              |
| d18 | trap       | none        | health      | ✓ (0.99)           | My health is fine, I just wanted to tell you I might be a few days late with a payment.                           |
| d19 | paraphrase | bereavement | none        | ✓ (1.00)           | We lost our baby last month and I just need you to know things might slip for a while.                            |
| d20 | paraphrase | job-loss    | none        | ✓ (1.00)           | I was sacked on Friday, so I thought you should know money will be tight.                                         |

## Vulnerability detection (any need recorded vs any need disclosed)

|       | recall               | precision          | tp / fn / fp / tn |
| ----- | -------------------- | ------------------ | ----------------- |
| regex | 35% (16/46; 23–49)   | 73% (16/22; 52–87) | 16 / 30 / 6 / 43  |
| Jev   | 100% (46/46; 92–100) | 96% (46/48; 86–99) | 46 / 0 / 2 / 47   |

## Latency

Per call as recorded: p50 242 ms, p95 294 ms, max 543 ms.

## Tokens and cost

Counted by TypeSafe (Jev)'s own tokenizer — not the same unit as another reader's. A case is one corpus row: two calls, the request and the need.

|         | calls | input tokens | output tokens | input per call | output per call | tokens per case |
| ------- | ----- | ------------ | ------------- | -------------- | --------------- | --------------- |
| request | 95    | 43767        | 5501          | 460.7          | 57.9            | 518.6           |
| need    | 95    | 38922        | 4612          | 409.7          | 48.5            | 458.3           |
| **all** | 190   | 82689        | 10113         | 435.2          | 53.2            | 976.9           |

Cost at list price, docs.typesafe.ai/models (2026-09-28) ($0.042 per million input tokens, $0 per million output): $0.00347 for the corpus, $0.000037 a case, $0.0366 per thousand cases.
