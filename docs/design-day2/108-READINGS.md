# 108 — Readings: one record for every reading, and a desk to read at

> **Status (2026-09-30):** WP129 (`101-DAY7-ROADMAP.md` Phase AI; `100-TARGET-DESIGN-V7.md` §6.8, decision D21; retires G85). Stage A is this note. Stage B is `core/schemas/review.ts`, the kind on the stores and the evidence store, the four checks reading it, `/workshop/readings` and `craftabot readings export`.

## 1. What it is

Since Day 5, whatever a practitioner has to read ships as `pending`:
- the catalogue's entries;
- the calibration tables' rows;
- the control maps' rows;
- the domain's decision rights;
- the blueprint notes' checkboxes;
- the screening lists;
- the error models and reviewer models.

Only one of these had a place to record a reading: `control-review` (WP110), for control rows. **`review` is that record for all eight kinds**, and **`/workshop/readings` is the queue**: every subject still to be read, with its source beside it and three buttons. The checks honour the records, so a reading turns a check green for the one row it names.

**A reading is never an edit.** The pack's row keeps what it ships. The review sits beside the row as content under the reader's name, as `control-review` did. What the reader wants changed goes on the record as an *amendment*. A maintainer puts it into the content (§4).

## 2. The record

```ts
// core/src/schemas/review.ts
interface Review {
  id: string;                         // local/reviews/<kind>--<slug of subject.id>
  subject: { kind: ReviewSubjectKind; id: string };
  verdict: 'accepted' | 'amended' | 'rejected';
  note?: string;
  by: Principal;                      // 55-PRINCIPAL.md — a name or an id, never a secret
  on: string;                         // ISO 8601
  amendment?: { field: string; value: Json };   // required on 'amended', refused otherwise
  schemaVersion: 1;
}
```

**One review per subject.** The id is derived from the subject, so a second reading replaces the first. It is the eighth content kind (`review`), under the segment `reviews` that `control-review` already uses. Like a view, it never enters the `local` pack.

**Reviewed means one thing.** A subject is *reviewed* when a review names it with `accepted` or `amended` (`isReviewed` in `core`).
- A `rejected` review keeps the subject pending. The reader has said the row is wrong, and the check stays red until a maintainer changes the content.
- The subject's own content can also say *reviewed*: the catalogue's `review: 'reviewed'`, a calibration row's `{ by, on }`, a control row with no `status`, or a ticked blueprint box. Such a subject is not in the queue at all.

## 3. The eight subject kinds

| Kind | Subject id | Pending when the content… | The source beside it | Where the host finds them |
|---|---|---|---|---|
| `catalogue-entry` | the entry's id (`prompt-injection-classifier`) | says `review: 'pending'` | the description, the citations, the coverage status | `GUARDRAIL_CATALOGUE` (`@craftabot/governance/catalogue`) |
| `calibration-row` | `<table id>#<row id>` (`fs-bank/calibration#age-band`) | says `review: 'pending'` | the title, the distribution, the source (publisher, table, edition, or *assumption*), the note | `PackManifest.calibrations` |
| `control-row` | `<map id>#<ref>` (`fs-bank/control-map#products-services`) | carries `status` (`unreviewed` or `pending`) | the framework, the obligation, the evidence named, the note | `registry.listControlMaps()` |
| `decision-right` | `<domain id>#<decision kind>` (`fs-bank/uk-retail-banking#adverse-credit-decision`) | always: the spec has no review field | the ceiling, the why, the source | `registry.listDomains()` |
| `blueprint-item` | `<note>#<item>` (`healthcare#4`; the unnumbered last box is `#tests`) | has `- [ ]` in its checklist | the box's line | `docs/blueprints/{HEALTHCARE,LOGISTICS,MANUFACTURING}.md`, parsed by `blueprintItems` |
| `screening-list` | `<pack>/screening#<list>` (`fs-bank/screening#sanctions`) | always | the list's entries: name, year of birth, note | `SCREENING_LIST` (`@craftabot/pack-fs-bank`), passed by the host |
| `error-model` | the model's id (`fs-lending/error/decision`) | always | the faults: the decision, the options, the direction, the rate's row | `PackManifest.errorModels` |
| `reviewer-model` | the model's id | always | accuracy, automation bias, seconds per case, each as the row it reads | `PackManifest.reviewerModels` |

**Models and their numbers are read apart.** An error model's rates, and a reviewer model's accuracy, bias and seconds, are calibration rows and are read as rows. The model's own reading covers its shape: which decisions it corrupts, in which direction, and whether the rows it names are the right ones.

**Why the host passes the last two sources.** The blueprints are documents, and the screening lists are a pack's constant rather than a manifest field. Adding a manifest field for one list would be a mechanism for one pack (hard rule 4). The Workbench imports both, the notes as `?raw`, and so does the harness. The fold (`readingSubjects` in `governance/reports/readings.ts`) takes them as `ReadingSources` like everything else.

## 4. The verdicts, and the amendment's path into content

- **`accepted`.** The row says what its source says. The check goes green for that row.
- **`amended`.** The row is right to be there, but one field should read otherwise, and `amendment: { field, value }` says which field and what value. The check goes green: the reader has read the row and said how it should read. The queue shows *amended: awaiting the edit* until a maintainer has put the value into the pack. At that point the maintainer also sets the content's own review (a calibration row's `{ by, on }`, the entry's `'reviewed'`, a ticked box, a control row's `status` removed). The subject then leaves the queue, and the review stays as the record of who read it.
- **`rejected`.** The row should not stand as written. The note says why, the check stays red, and the queue shows *rejected*.

`craftabot readings export` writes the queue with its reviews and amendments as one JSON file, or as markdown with `--format markdown`. That file is the maintainer's work list.

## 5. What each check reads

Every check takes `reviews?: readonly Review[]` beside a `requireReview?: boolean`. Without `requireReview`, a check behaves as it did before this note.

| Check | Raises, under `requireReview` | Honours |
|---|---|---|
| `checkCalibration(table, { requireReview, reviews })` | `calibration.review-pending` per row | a review of `calibration-row` `<table>#<row>` |
| `checkCatalogue(catalogue, registry, { requireReview, reviews })` | `catalogue.review-pending` per entry | a review of `catalogue-entry` `<id>` |
| `checkControlMap(map, registry, { requireReview, reviews })` | `control-map.review-pending` per row with a `status` | a review of `control-row` `<map>#<ref>` |
| `checkDomainPack(spec, registry, { requireReview, reviews })` | `domain.decision-right-pending` per right, and passes both options to the calibration and control-map checks it already runs | a review of `decision-right` `<domain>#<kind>` |

The blueprint items, the screening lists and the two model kinds have no check of their own. The queue is their check.

## 6. The desk

`/workshop/readings`, on the Assurance lens's rail:
- **Readouts.** A readout per kind, *read of total*, and the open count: unread plus rejected, which is the pending set the checks raise.
- **The queue.** Grouped by kind. Each subject shows its source beside it and three buttons: **Accept**, **Amend…** (a field and a value), **Reject** (a note is required).
- **The filter.** In the URL: `?kind=calibration-row&state=unread`, which a saved view can hold.
- **Push.** Every review goes to the evidence store as the new evidence kind `review`, table `evidence_reviews`.

The reader is the Settings name as a principal (`browserPrincipal`). The seven readings Day 5 and Day 6 named for Andrew are the queue's first contents, because they are what ships pending.

## 7. `control-review`, kept as an alias

`control-review` records stay valid for one release. `reviewsFromContent` reads both kinds:
- a `control-review` becomes a `review` of `control-row` `<mapId>#<ref>`;
- `reviewed` becomes `accepted`, `disputed` becomes `rejected`;
- `by` becomes `{ kind: 'person', id: by }`;
- `reviewedAt` becomes `on`.

If both kinds name one row, the later one wins. The Assurance screen's row form now writes `review`. The assurance pack reads through `reviewsFromContent` and keeps its control-row section's shape (accepted or amended reads *reviewed*, rejected reads *disputed*). `docs/migrations.md` records the change.

## 8. Tests (the DoD)

- **One row only.** A review for one calibration row turns `checkCalibration({ requireReview })` green for that row: the issue count falls by exactly one. The same holds for the catalogue, a control row and a decision right.
- **The queue's count.** The open count equals the pending set counted straight from the sources, per kind, across all eight kinds.
- **The alias.** A `control-review` record reads as a `review` through the content store and through the assurance pack.
- **The screen.** `/workshop/readings` is in the visual set, the axe pass and a keyboard walk (accept a row and see the readout move).

## 9. Stage notes
