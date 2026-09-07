# python-reader

One Python script that reads a Craft A Bot trace bundle with **no code from this repo** — the
proof behind `docs/design-day2/41-TARGET-DESIGN-V4.md` §6.16 (WP73, `62-THE-TAIL.md` §4.4): every
artefact that crosses a boundary has a generated JSON Schema in `docs/schemas/`, and a reader in
another language stands on the schema and the file alone.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python read_bundle.py fixtures/say-hello.craftabot-bundle.json
```

or, from the repo root, the way CI runs it (skips cleanly with no Python on `PATH`):

```bash
npm run example:python
```

What it does:

1. **Validates** the bundle against `docs/schemas/craftabot-bundle.schema.json` with `jsonschema`
   (Draft 2020-12).
2. **Verifies** it: recomputes every run's `traceDigest`, the group's `groupDigest` when there is a
   group, and the `bundleDigest` over all of them — SHA-256 over the bytes `JSON.stringify` wrote,
   which `json.dumps(…, separators=(",", ":"), ensure_ascii=False)` reproduces — and compares.
3. **Prints** one line per run (id, card, outcome, events, ticks) and a verdict. Exit 1 on any
   schema error or digest mismatch.

`fixtures/say-hello.craftabot-bundle.json` is the bundle the app writes over the starter pack's
say-hello run; `packages/evals/src/python-reader.test.ts` rebuilds it the same way and asserts
the committed file is byte-equal, so the fixture is never hand-edited. Everything in it is
synthetic (hard rule 9).

`requirements.txt` is `jsonschema` and nothing else. If the script ever needed a helper from
`@craftabot/core`, the seam would be a fiction — that is the whole point of the example.
