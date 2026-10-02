# The Guardrail Catalogue — PDF

Builds `docs/catalogue.pdf`, a readable, Axiom Verity-branded edition of the 69-entry
Guardrail Catalogue, from the generated `docs/catalogue.md` (`npm run catalogue:doc`).

    cd docs/manual/pdf/catalogue
    python3 build_catalogue.py    # parses ../../../catalogue.md, writes cover.html, body.html, _header.html, _footer.html
    python3 render_catalogue.py   # Playwright Chromium → Guardrail-Catalogue.pdf (cover + body, pypdf merge)

- `descriptions.py` — the plain-English description for every entry (keyed by id), the category
  introductions, and the vocabularies (sub-categories, maturity, status, points, OWASP threat names).
  The build asserts the 69 ids match the content; a new entry needs a description here.
- Brand block (fonts, palette, base CSS, mark) is reused from `../build.py`; set `CAB_PDF_BRAND` to
  point elsewhere.
- Statuses, notes, implementers and sources come from `catalogue.md` and are never hand-edited here.
