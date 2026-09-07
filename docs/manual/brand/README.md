# Brand assets for the PDF

`USER-MANUAL.md` is written to be typeset as an Axiom Verity branded PDF. Drop the
assets here and fill in the values in the comment block at the head of the manual.

| Slot | File | Notes |
|---|---|---|
| Wordmark | `axiom-verity-wordmark.svg` | Cover and title page |
| Mark | `axiom-verity-mark.svg` | Running header, favicon-scale |
| Cover image | `cover.png` | The Playground's box art is the obvious candidate |

Values to decide (they live in the manual's head comment, not here):
primary and accent colours, display / body / mono typefaces, and the document
classification line in the control table.

Figures are **not** stored here. They are the committed visual-regression
baselines under `apps/workbench/e2e/__screenshots__/<platform>/`, so they cannot
drift from the product without a test failing — see Appendix D. Regenerate with
`npm run e2e:visual`, and recapture at 2x for print.
