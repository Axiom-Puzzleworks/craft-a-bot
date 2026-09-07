# Brand assets for the PDF

Nothing needs to be dropped here any more. The manual is typeset in the real Axiom
Verity identity, taken from that project's own design system rather than copied or
approximated, and the values are recorded in the comment block at the head of
`USER-MANUAL.md`. The build lives in `../pdf/`.

| Slot | Where it comes from |
|---|---|
| Wordmark | **Set, not an image** — *Axiom* in `#10233a`, *Verity* in `#7a5a1a`, Newsreader 600, `0.36em` word gap. Stays sharp at any size and needs no file. |
| Mark | `axiomverity/src/lib/assets/axiom-mark.svg` — the open navy triangle with three gold nodes, inlined on the cover |
| Typefaces | `@fontsource/newsreader`, `@fontsource/inter`, `@fontsource/ibm-plex-mono` — the same self-hosted files the website uses, embedded in the PDF |
| Palette | `axiomverity/DESIGN.md` frontmatter: navy `#0e2a4a`, ink `#10233a`, muted `#4a5a72`, gold `#a8781f`, gold-ink `#7a5a1a`, gold-tint `#f2e6c8`, paper `#f7f7f5`, hairlines `#dde2df` / `#c4ccd3` |
| Cover | Typographic, not illustrated: letterhead rule, wordmark, title, the ∴ proof-mark, the *FOR SIMULATION ONLY* strap. The brand's own reading is a report cover, not a hero banner |

**Two rules the stylesheet enforces**, because they are the easy ones to lose:
`#a8781f` never carries text below 18px — `#7a5a1a` does — and Inter never sets a
heading.

Figures are **not** stored here. They are the committed visual-regression baselines
under `apps/workbench/e2e/__screenshots__/<platform>/`, so they cannot drift from the
product without a test failing — see Appendix D. Regenerate with `npm run e2e:visual`,
and recapture at 2× for print.
