# Replace the manual's figure placeholders with the real images, and align
# Appendix D's table with them. Writes MANUAL-FOR-PDF.md.
import io, re

src = io.open('USER-MANUAL.md', encoding='utf-8').read()

PAT = re.compile(
    r'^> \*\*Figure (\d+)\*\* — (.+?) \*\(Appendix D, `([a-z0-9\-]+\.png)`\.\)\*\s*$',
    re.M)

found = []
def repl(m):
    n, cap, png = m.group(1), m.group(2).rstrip('.'), m.group(3)
    found.append((int(n), png, cap))
    return f'![Figure {n} — {cap}](figures/{png})'

src = PAT.sub(repl, src)
assert len(found) == 25, len(found)
assert sorted(n for n, _, _ in found) == list(range(1, 26))

rows = '\n'.join(f'| {n} | `{png}` | {cap} |' for n, png, cap in sorted(found))
start = src.index('## Appendix D — Figures')
end = src.index('## Appendix E —')
src = src[:start] + f"""## Appendix D — Figures

The figures are the committed visual-regression baselines: the same images the build compares against on every change, so they cannot drift from the product without a test failing. Regenerate them with `npm run e2e:visual`; the sources are under `apps/workbench/e2e/__screenshots__/<platform>/`, where `<platform>` is `win32` or `linux`.

They are reproduced at 1×, which is legible at the width used here. Recapture at 2× device scale before printing any of them larger.

| Figure | File | Shows |
|---|---|---|
{rows}

Captured and not placed: `workshop-run-lab-explain.png` (the explanation panel), `ws-runs.png` (the Run Browser), `ws-run-lab-golden.png`, `ws-incidents.png`, `ws-safety-case.png`, `ws-sinks.png`, `ws-test-bench.png`.

""" + src[end:]

io.open('MANUAL-FOR-PDF.md','w',encoding='utf-8').write(src)
print('figures placed:', len(found))
