# Replace the manual's figure placeholders with the real images, and align
# Appendix D's table with them. Writes MANUAL-FOR-PDF.md.
import io, re, glob, os
from PIL import Image, ImageChops

# Trim each baseline to its content for print: the visual pass captures a fixed,
# very tall page, so cut below the last row of the main column that differs from
# the page ground, and cap the height at 1.6x the width.
os.makedirs('figures-print', exist_ok=True)
for f in sorted(glob.glob('figures/*.png')):
    im = Image.open(f).convert('RGB')
    w, h = im.size
    x0 = 220 if w >= 1000 else 0          # skip the Workshop rail
    main = im.crop((x0, 0, w, h))
    bg = Image.new('RGB', main.size, main.getpixel((main.size[0]-1, main.size[1]-1)))
    bbox = ImageChops.difference(main, bg).getbbox()
    bottom = min(h, (bbox[3] if bbox else h) + 28)
    bottom = min(max(bottom, int(w * 0.5)), int(w * 1.6))
    im.crop((0, 0, w, bottom)).save('figures-print/' + os.path.basename(f))

src = io.open('USER-MANUAL.md', encoding='utf-8').read()

PAT = re.compile(
    r'^> \*\*Figure (\d+)\*\* — (.+?) \*\(Appendix D, `([a-z0-9\-]+\.png)`\.\)\*\s*$',
    re.M)

found = []
def repl(m):
    n, cap, png = m.group(1), m.group(2).rstrip('.'), m.group(3)
    found.append((int(n), png, cap))
    return f'![Figure {n} — {cap}](figures-print/{png})'

src = PAT.sub(repl, src)
assert len(found) == 27, len(found)
assert sorted(n for n, _, _ in found) == list(range(1, 28))

rows = '\n'.join(f'| {n} | `{png}` | {cap} |' for n, png, cap in sorted(found))
start = src.index('## Appendix D — Figures')
end = src.index('## Appendix E —')
src = src[:start] + f"""## Appendix D — Figures

The figures are the committed visual-regression baselines: the same images the build compares against on every change, so they cannot drift from the product without a test failing. Regenerate them with `npm run e2e:visual`; the sources are under `apps/workbench/e2e/__screenshots__/<platform>/`, where `<platform>` is `win32` or `linux`.

They are reproduced at 1×, which is legible at the width used here. Recapture at 2× device scale before printing any of them larger.

| Figure | File | Shows |
|---|---|---|
{rows}

Captured and not placed: `workshop-run-lab-explain.png` (the explanation panel), `ws-runs.png` (the Run Browser), `ws-run-lab-golden.png`, `ws-incidents.png`, `ws-safety-case.png`, `ws-sinks.png`, `ws-test-bench.png`, and the access set (`access-320-*.png`, `access-640-*.png`, `access-pipeline-lit.png` — the canvases at 320 px and at 200 % zoom, and the lit Pipeline under reduced motion; WP110).

""" + src[end:]

io.open('MANUAL-FOR-PDF.md','w',encoding='utf-8').write(src)
print('figures placed:', len(found))
