# 81 — The tail of Day 5 (WP91)

> **Status:** design of record for WP91 (`65-DAY5-ROADMAP.md` Phase V, its last row), opened 2026-09-11 on the `day5` branch after WP90. One stage: the close-outs, the manual, the budgets, the roundels — each small, none a mechanism.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §12's last row (the cache name per edition, CLOSE-2) and the UX register's CLOSE-1; the manual's Part G and the rebuilt PDF (`64-…` §14 item 15); the edition budgets re-stated; the instrument-icon seam extended for the five Day 5 roundels.

---

## 1. The two close-outs

- **CLOSE-2, one cache per edition.** `service-worker.ts` names its cache `craftabot-shell-<editionId>-<version>` (`editionId` from `lib/edition-id.ts`, the build-time `CAB_EDITION`) and its activate step deletes only *this edition's* older caches. Three sections on one origin each keep their own shell; the second to register never empties the first's. `e2e/editions/two-sections.spec.ts` (the `site` project of `playwright.editions.config.ts`, from the origin's root) registers the Workshop's worker, opens the Playground, sees both caches and both shells, and returns. `docs/publishing.md` §2 states the rule.
- **CLOSE-1, the tidy banner's singular.** `runs/+page.svelte`: with one run left part-way that is an episode, the parenthesis reads *and it is an episode*; two or more keep *one of them an episode* / *n of them episodes*.

## 2. The manual

`docs/manual/USER-MANUAL.md` gains **Part G — The bank in motion** (§42 the population and the calibration table; §43 workflows and the Pipeline; §44 contexts and the ontology; §45 the clock and the Monitor; §46 the lenses, Conduct and Model risk; §47 experiments and the register; §48 the site), the Contents, Appendix A's six new routes, Appendix B's six new schemas, Appendix D's figures 21–25 (the Workflows, Monitor, Conduct, Model-risk and Experiments baselines). The PDF is rebuilt through `docs/manual/pdf/` (`prep.py` → `build.py` → `render.py`); the fonts, the brand mark and the intermediate HTML stay out of the repository (`docs/manual/pdf/.gitignore`), as `Appendix E` says they do.

## 3. The roundels

`lib/assets/instruments.ts` carries five more ids — `pipeline`, `clock`, `lens`, `experiment`, `register` — each a placeholder to the wave 2 contract (96 × 96, `#disc` tintable, `#glyph` in cream), held by `wave2.test.ts` beside the eleven, and used on the Pipeline's strip, the Monitor's clock strip, the guided strip, the Experiments result strip and the register's heading. `63-…` §5.2's count moves from eleven to sixteen files for the commission.

## 4. The budgets, re-stated

`01-ARCHITECTURE.md` §8 restates the four budgets and the Worker's as they stand after Day 5, with what each phase added; `edition.ts` carries the same per edition beside its number.

## 5. Divergences

- `64-…` §14 item 15 asks for a Part G that includes *the site*; §48 is a paragraph, since the site itself is WP92's (`65-…` Phase W) and this repository's half of it is the release artefact and `docs/publishing.md`.
- The manual's figures are the win32 baselines; the Linux ones are re-taken in the temp-CI cycle the sprint's notes record, and `prep.py` reads whichever platform the machine building the PDF has.
