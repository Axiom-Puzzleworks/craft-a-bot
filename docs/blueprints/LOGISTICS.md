# Logistics — a synthetic freight forwarder

> **Status:** a blueprint note, written 2026-09-13 (WP108; `83-…` §6.6.3). The checklist in [`DOMAIN-PACK.md`](DOMAIN-PACK.md) applied to a freight forwarder, without code. The fixture `fixtures/logistics.domain.json` is the `DomainSpec` this note describes; it validates and fails `checkDomainPack` because no pack is installed. **Not scheduled.**

## 1. The world

**Root entity:** a _shipment_ — a house bill number from the seed, a consignor and a consignee (both synthetic companies, sized micro / small / medium / large — the cohort axis is the consignor's size, not a person), an origin and a destination, a mode (air, sea, road), a commodity with a tariff code, a declared value, a dangerous-goods class where there is one, and a status. **Around the shipment:** carriers and their schedules, customs declarations with their status (pre-lodged, accepted, held, cleared), exceptions (delay, damage, hold), a sanctions screening result on every party.

**Lines** (four, every operation tiered): _tracking_ (where is it — observe; add an event — reversible), _customs_ (read a declaration — observe; draft one — reversible; lodge — _irreversible_; amend after acceptance — irreversible), _carrier booking_ (quote — observe; book — reversible until cut-off; confirm past cut-off — irreversible), _DG classification_ (look up a UN number — observe; classify — reversible; accept for carriage — _irreversible and never the assistant's_).

**The calibration table:** the mode mix and the commodity mix from HMRC's overseas trade statistics; the DG share from the Civil Aviation Authority's dangerous-goods occurrence data; the exception rates a stated assumption (carrier performance data is private); the consignor-size weights from the Business Population Estimates. Eight rows, four cited, four stated.

**Personas:** the consignor who wants it on the next flight; the consignee who says it is damaged; the carrier's agent who wants the DG paperwork now; the broker who asks the assistant to "just lodge it".

## 2. The journeys

| Journey                    | Status     | Stages (sketch)                                                                                      | Where the assistant stops                                                                                 |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Booking and quotation      | shipped    | request → screen the parties (rule: the sanctions list in truth) → quote → book → confirm            | a sanctions match stops everything (ceiling 2: a person decides, the assistant records)                   |
| Customs declaration        | shipped    | shipment → classify (rule: the tariff table in truth) → draft → check → lodge → clear                | lodging is a person's below four eyes (3); the assistant drafts                                           |
| Exception handling         | shipped    | event → classify (delay / damage / hold) → contact → resolve → record                                | a damage claim above the limit is a person's (3); a delay notice the assistant's (4)                      |
| Dangerous-goods acceptance | shipped    | declaration → classify (rule: the DG table in truth) → check the packing → accept or refuse → record | acceptance is a certified person's, ceiling **2**; the assistant's configuration is _check and recommend_ |
| Rate management            | supporting | —                                                                                                    | a layout the quotation journey reads; no workflow                                                         |
| Insurance claims           | out        | —                                                                                                    | _why:_ the claim is the insurer's journey, not the forwarder's; out of the domain                         |
| Warehouse operations       | out        | —                                                                                                    | _why:_ the physical handling has no desk; the domain models the office, not the floor                     |

## 3. The obligations and the rights

**The vocabulary:** `hmrc:cds-declaration` (a customs declaration is true, complete and lodged by an authorised person), `hmrc:tariff-classification` (the commodity code is the declarant's responsibility), `iata:dgr` (dangerous goods by air: classification, packing, marking, the shipper's declaration, acceptance by a trained person), `adr:road-dg` (the same by road), `ofsi:sanctions-screening` (every party screened; a match frozen and reported), `cbp:aeo-records` (records kept for the authorised operator's audit), `equality-act:fairness` (reused — here over the consignor's size, the parity axis).

**Decision rights:** `sanctions-match-handling`, **2**; `customs-lodgement`, **3**; `tariff-classification`, **3** (the declarant's); `dg-acceptance`, **2** (a certified acceptance-check person's; the assistant recommends and never accepts); `carrier-booking`, **4**; `damage-claim-above-limit`, **3**; `delay-notice`, **4**.

## 4. The special category

Not personal data in the GDPR sense — the domain has few people — but two classes the spec names as special because a wrong disclosure has physical or legal consequence: **sanctions matches** (a match is never told to the party — the tipping-off shape the bank's fraud desk has) and **DG misdeclarations** (a suspected misdeclaration is recorded to the regulator, not discussed with the shipper). The ontology's classes: `Shipment`, `Party`, `Carrier`, `Declaration`, `Exception`, `DangerousGoods`, `SanctionsMatch`; special: `SanctionsMatch`, `DangerousGoods`.

## 5. What the blueprint predicts is hard

- **Few conduct obligations, many safety ones.** The evaluators are physical-consequence rules: _accepted DG has a matching packing instruction_, _a lodged declaration's code matches the table in truth_, _no booking past cut-off without a person_. The rubric evaluators the bank leans on for _told plainly_ matter less; the deterministic ones are the whole story.
- **The cohort is a company.** Parity over consignor size is a new axis for `DeskTruth.cohort` — the metrics package reads any categorical, so nothing changes in `@craftabot/metrics`, but the fairness reading (_is the small consignor quoted worse?_) is a commercial question, not a protected characteristic.
- **Irreversible everywhere.** Three lines carry an irreversible operation and one is never the assistant's. The Level 4 configuration has a person at three stages; `rules-only` cannot lodge. The human-load rows will show the least autonomous journeys in the repository.
- **Truth that is a tariff table.** As in healthcare: the table in truth, the revealed record built from its outputs.

## 6. The checklist, reviewed against the scaffold's tree

- [ ] 0 — the spec (`fixtures/logistics.domain.json`) validates.
- [ ] 1 — the packs: `freight-forwarder` (world), `booking`, `customs`, `exceptions`, `dg-acceptance`.
- [ ] 2 — four shipped, one supporting, two out with a reason.
- [ ] 3 — every stage's obligation in the seven-tag vocabulary.
- [ ] 4 — seven rights; every ceiling among them.
- [ ] 5 — a control row per obligation.
- [ ] 6 — eight calibration rows, four cited, four stated with a note; pending review.
- [ ] 7 — two special classes; every match and every DG record classified.
- [ ] 8 — four lines, every operation tiered; `dg-acceptance` and `customs-lodge` irreversible.
- [ ] 9 — four personas.
- [ ] 10 — a book and a campaign per shipped journey.
- [ ] the golden run per journey; the red run per journey; the matched pair on quotation (consignor size); the sweep.

## 7. What would be typed, by count

| Piece                                       | Count                      |
| ------------------------------------------- | -------------------------- |
| World pack files                            | ~14                        |
| Calibration rows                            | 8                          |
| Journey packs                               | 4                          |
| Per journey: actions / predicates / layouts | 5–6 / 3 / 8–10             |
| Per journey: goal cards / scenarios         | 8 / 14–18                  |
| Policy cards                                | ~16                        |
| Evaluators (deterministic / rubric)         | 5–7 / 0–1 per journey, ~26 |
| Control rows                                | 7                          |
| Decision rights                             | 7                          |
| Campaign files                              | 8                          |
| Playground pages                            | 4                          |
| Tests                                       | ~28                        |

## 8. Sizing

The world is simpler than the trust's (fewer classes, no clinical tables) but the lines carry more irreversible operations and the DG table is large to type: the world pack **M**; the four journeys **M** each, the DG journey nearer **L** for its table. **About five sessions of M, one of them long.** Not scheduled.
