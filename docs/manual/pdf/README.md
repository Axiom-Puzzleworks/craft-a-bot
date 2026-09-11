# Building the branded PDF

Renders `../USER-MANUAL.md` into `Craft-A-Bot-User-Manual.pdf` in the Axiom Verity
identity — the palette, marks and typefaces taken from that project's own design
system (`DESIGN.md`), not approximated.

```sh
npm install @fontsource/newsreader @fontsource/inter @fontsource/ibm-plex-mono
mkdir -p fonts && cp node_modules/@fontsource/*/files/*-latin-{400,600,700}-{normal,italic}.woff2 fonts/ 2>/dev/null
pip install markdown playwright pypdf && python -m playwright install chromium

python prep.py     # figure placeholders -> real images; Appendix D aligned
python build.py    # markdown -> cover.html + body.html, brand stylesheet inlined
python render.py   # headless Chromium -> A4 PDF, cover merged, metadata set
```

**What each step does**

- `prep.py` turns each `> **Figure n** — … *(Appendix D, `x.png`.)*` placeholder in the
  manual into the real screenshot from `apps/workbench/e2e/__screenshots__/win32/`, then
  rewrites Appendix D's table from what it actually placed. The manual stays readable as
  plain markdown; nothing is edited by hand.
- `build.py` holds the brand: `#0e2a4a` navy, `#10233a` ink, `#a8781f` / `#7a5a1a` gold,
  `#f7f7f5` paper, Newsreader for every heading, Inter for body, IBM Plex Mono for labels
  and code, near-square corners. The three typefaces are embedded as base64 so the PDF
  sets identically to the website. The cover is typographic: letterhead rule, wordmark,
  title, the ∴ proof-mark, the _FOR SIMULATION ONLY_ strap.
- `render.py` prints the cover full-bleed with no running head, prints the body with the
  running header and footer (real page numbers), merges the two and writes the metadata.

**Two brand rules the stylesheet enforces**, because they are easy to lose:
`#a8781f` never carries text below 18px — `#7a5a1a` does — and Inter never sets a heading.

**Figures** are 1×. Recapture at 2× device scale (`npm run e2e:visual`) before printing
any of them larger than about 120 mm.
