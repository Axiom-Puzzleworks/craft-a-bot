# Healthcare — a synthetic NHS-shaped trust

> **Status:** a blueprint note, written 2026-09-13 (WP108; `83-…` §6.6.3). The checklist in [`DOMAIN-PACK.md`](DOMAIN-PACK.md) applied to a hospital trust, without code. The fixture `fixtures/healthcare.domain.json` is the `DomainSpec` this note describes; it validates and fails `checkDomainPack` because no pack is installed. **Not scheduled.**

## 1. The world

**Root entity:** a _patient_ — an NHS-number-shaped synthetic identifier (`syntheticId` with a Modulus 11 check digit that no real number could carry, the way `syntheticPan` fails Luhn on purpose), a name, a date of birth, a registered practice, a cohort (age band, deprivation decile, ethnicity band, an interpreter need). **Around the patient:** encounters (an admission, an outpatient visit, an emergency attendance), medications (current, allergies, adverse reactions), referrals (from a practice, to a specialty, with a priority), results (pathology and imaging, each with a reference range and a flag), appointments.

**Lines** (five, every operation tiered): the _record_ (read the summary — observe; add a note — reversible), _e-prescribing_ (view the chart — observe; propose a prescription — reversible; sign — _irreversible and never the assistant's_), _referrals_ (read the queue — observe; triage into a priority — reversible; book — reversible), _pathology_ (read a result — observe; acknowledge — reversible), _appointments_ (free slots — observe; book, move, cancel — reversible).

**The calibration table** is richer than the bank's and the sources are public: NHS Digital's Hospital Episode Statistics for the admission mix, the Referral to Treatment statistics for waiting-time bands, the Prescribing Cost Analysis for the medication mix, the Index of Multiple Deprivation for the decile weights, the Census for the ethnicity bands. Every row cites a publication; every row is `review: 'pending'` until a reader has read it. The scaffold's two stated assumptions become perhaps twelve cited rows.

**Personas:** the worried relative who is not the patient; the patient who wants a result over the phone; the clinician in a hurry; the caller who says they are the GP.

## 2. The journeys

| Journey                   | Status     | Stages (sketch)                                                                                       | Where the assistant stops                                                                                                                  |
| ------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Triage and referral       | shipped    | intake → history → urgency (rule in truth: the NICE-shaped red flags) → priority → book → confirm     | the priority is a clinician's below four eyes (ceiling 3)                                                                                  |
| Prescribing support       | shipped    | chart → interactions (rule: the contraindication table in truth) → proposal → clinician review → sign | the assistant _never_ recommends: it lists interactions; a recommendation is the MHRA question (§4)                                        |
| Results communication     | shipped    | result → flag → who may be told (rule: the record's consent) → tell → record                          | a flagged result is told by a clinician (ceiling 3); a normal one may be the assistant's under four eyes (4)                               |
| Appointment and follow-up | shipped    | request → identify → slots → book → confirm                                                           | the assistant's at Level 4                                                                                                                 |
| Discharge summary         | supporting | —                                                                                                     | a world layout the other journeys read; no workflow of its own                                                                             |
| Safeguarding              | out        | —                                                                                                     | _why:_ a safeguarding concern is a person's from its first word; the domain refuses to model the referral as a journey the assistant walks |
| Mental health crisis      | out        | —                                                                                                     | _why:_ the risk assessment is clinical and the harm of a wrong answer is not measurable by a card; out of the domain                       |

## 3. The obligations and the rights

**The vocabulary** (a tag, a gloss): `ukgdpr:art-9-health` (health data is special category; read only for the purpose), `nhs:confidentiality-code` (the Caldicott principles; the minimum necessary; the patient's own consent to sharing), `nhs:caldicott-3` (no use of confidential information unless necessary — the domain's data-minimisation), `mhra:samd-boundary` (software that recommends a clinical action is a medical device; the assistant lists and never recommends), `nice:red-flags` (the referral urgency rule the triage journey carries), `cqc:safe-effective` (the fundamental standards the control map cites), `equality-act:fairness` (the bank's, reused: outcomes compared by cohort).

**Decision rights** (kind, ceiling, source): a prescription signed — `prescription-sign`, **1** (the assistant drafts; never proposes to a patient; the Human Medicines Regulations); a prescription proposed to a clinician — `prescription-proposal`, **3** (a clinician's below four eyes; the MHRA boundary); referral priority — `referral-priority`, **3** (NICE referral guidance); a flagged result told — `flagged-result-communication`, **3**; a normal result told — `normal-result-communication`, **4**; an appointment booked — `appointment-booking`, **4**; sharing with a third party — `third-party-disclosure`, **2** (the Confidentiality Code: a person decides, the assistant records).

## 4. The special category

**Every clinical record**: encounters, medications, results, the referral's reason. The ontology's classes are `Patient`, `Encounter`, `Medication`, `Allergy`, `Referral`, `Result`, `Appointment`, `Practice`, `Clinician`; the special category is `Encounter`, `Medication`, `Allergy`, `Referral`, `Result` — five of nine, where the bank has one of its many. `domain.special-category` will hold every desk's records to that list, and the context ladder (`70-CONTEXT-AND-ONTOLOGY.md`) will keep the clinical records off the desk until a purpose earns them: the appointment journey never sees a result.

## 5. What the blueprint predicts is hard

- **The MHRA boundary.** A journey that _recommends_ a prescription is a device question. The prescribing journey is built so the assistant produces a list (the interactions the chart shows against the contraindication table in truth) and a clinician produces the decision; the policy card `no-recommendation` blocks a `say` that contains a dose or a drug name outside the list; the evaluator `listed-not-recommended` reads the transcript for the shape of a recommendation. The blueprint refuses to cross the line and says so in the `out` rows' register.
- **The calibration sources.** Richer than the bank's and better cited, but the mix is by trust: a row per source with a stated trust-level simplification, and the review takes a reader who knows the statistics.
- **Truth that is a table.** The contraindication table and the red-flag rule are truth the assistant must not read; `checkDesk`'s leak check finds a drug name in a snapshot easily, so the revealed chart must be built from the table's _outputs_ (flags) and never its rows.
- **Cohort.** Ethnicity and deprivation are on the record and are the parity axis; the matched pair is a referral that differs only in the decile.

## 6. The checklist, reviewed against the scaffold's tree

- [ ] 0 — the spec (`fixtures/healthcare.domain.json`) validates.
- [ ] 1 — the packs: `nhs-trust` (world), `triage-referral`, `prescribing-support`, `results-communication`, `appointments` (journeys).
- [ ] 2 — four shipped, one supporting, two out with a reason.
- [ ] 3 — every stage's obligation in the seven-tag vocabulary.
- [ ] 4 — seven decision rights; every configuration's ceiling among them at its level.
- [ ] 5 — one control row per obligation, citing a card and an evaluator.
- [ ] 6 — the table cited on every row (twelve rows), pending review.
- [ ] 7 — five special-category classes, every clinical record classified.
- [ ] 8 — five lines, every operation tiered; `prescription-sign` irreversible and no assistant action calls it.
- [ ] 9 — four personas, named once.
- [ ] 10 — a book and a campaign per shipped journey.
- [ ] the golden run per journey; the red run per journey; the matched pair on triage; the sweep over every fixture.

## 7. What would be typed, by count

| Piece                                                                                                                            | Count                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| World pack files (model, generators, records, calibration, five lines, obligations, controls, personas, ontology, domain, index) | ~16                        |
| Calibration rows                                                                                                                 | 12                         |
| Journey packs                                                                                                                    | 4                          |
| Per journey: desk actions / predicates / layouts                                                                                 | 5–7 / 3–4 / 8–12           |
| Per journey: goal cards / scenarios                                                                                              | 8–12 / 16–24               |
| Policy cards                                                                                                                     | 5 per journey, ~20         |
| Evaluators (deterministic / rubric)                                                                                              | 4–6 / 1–2 per journey, ~24 |
| Control rows                                                                                                                     | 7–10                       |
| Decision rights                                                                                                                  | 7                          |
| Campaign files (baseline + book per journey)                                                                                     | 8                          |
| Playground pages                                                                                                                 | 4                          |
| Tests (world, contract, solvability, campaign, book-campaign, workflow per journey; domain; calibration over a population)       | ~30                        |

## 8. Sizing

Four journeys on the bank's pattern ran **M** each in Phase AA (`84-…` §3) with the world already built. Here the world is new and the calibration richer: the world pack **L**; the four journeys **M** each; the calibration review by a reader who knows the statistics is outside the count. **About five to six sessions of M plus one L.** Not scheduled.
