import io, re, base64, json, pathlib, markdown

ROOT = pathlib.Path('.')

# ---------- brand ----------
NAVY='#0e2a4a'; INK='#10233a'; MUTED='#4a5a72'; GOLD='#a8781f'; GOLDINK='#7a5a1a'
GOLDTINT='#f2e6c8'; PAPER='#f7f7f5'; SURFACE='#ffffff'; INSET='#eef1ee'
HAIR='#dde2df'; HAIRSTRONG='#c4ccd3'

def font_face(family, file, weight, style='normal'):
    b64 = base64.b64encode((ROOT/'fonts'/file).read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};"
            f"font-display:block;src:url(data:font/woff2;base64,{b64}) format('woff2');}}")

FONTS = ''.join([
    font_face('Newsreader','newsreader-latin-400-normal.woff2',400),
    font_face('Newsreader','newsreader-latin-600-normal.woff2',600),
    font_face('Newsreader','newsreader-latin-400-italic.woff2',400,'italic'),
    font_face('Inter','inter-latin-400-normal.woff2',400),
    font_face('Inter','inter-latin-600-normal.woff2',600),
    font_face('Inter','inter-latin-700-normal.woff2',700),
    font_face('IBM Plex Mono','ibm-plex-mono-latin-400-normal.woff2',400),
    font_face('IBM Plex Mono','ibm-plex-mono-latin-700-normal.woff2',700),
])

MARK = (ROOT/'axiom-mark.svg').read_text(encoding='utf-8')

CSS = f"""
{FONTS}
*{{box-sizing:border-box}}
html{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
body{{margin:0;font-family:Inter,system-ui,sans-serif;font-size:10.5pt;line-height:1.55;
      color:{INK};background:{SURFACE};}}
p{{margin:0 0 .62em}}
a{{color:{GOLDINK};text-decoration:none;border-bottom:1px solid {HAIRSTRONG}}}
strong{{font-weight:600}}
em{{font-style:italic}}

h1,h2,h3,h4{{font-family:Newsreader,Georgia,serif;font-weight:600;color:{INK};
             line-height:1.2;margin:0}}

/* --- Part title page --- */
h1{{page-break-before:always;break-before:page;font-size:30pt;letter-spacing:-.01em;
    padding-top:30mm;padding-bottom:6mm;border-top:3px solid {NAVY};margin-bottom:10mm}}
h1.first{{page-break-before:auto;break-before:auto}}
h1 + p{{color:{MUTED};font-size:11.5pt;max-width:42em}}

h2{{font-size:16pt;margin:1.7em 0 .5em;padding-top:.55em;border-top:1px solid {HAIR};
    page-break-after:avoid;break-after:avoid}}
h3{{font-size:12.4pt;margin:1.3em 0 .35em;page-break-after:avoid;break-after:avoid}}
h4{{font-size:11pt;margin:1.1em 0 .3em;page-break-after:avoid;break-after:avoid}}
h2+*,h3+*,h4+*{{page-break-before:avoid;break-before:avoid}}

hr{{border:0;border-top:1px solid {HAIR};margin:1.6em 0}}

ul,ol{{margin:0 0 .7em;padding-left:1.25em}}
li{{margin:.16em 0}}

code{{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.86em;
      background:{INSET};border:1px solid {HAIR};border-radius:.25rem;padding:.04em .3em}}
pre{{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:8.4pt;line-height:1.45;
     background:{INSET};border:1px solid {HAIR};border-radius:.35rem;padding:.75em .9em;
     overflow:visible;white-space:pre-wrap;word-break:break-word;margin:.7em 0;
     page-break-inside:avoid;break-inside:avoid}}
pre code{{background:none;border:0;padding:0;font-size:inherit}}

blockquote{{margin:.9em 0;padding:.75em .95em;background:{INSET};
            border:1px solid {HAIR};border-radius:.35rem;
            page-break-inside:avoid;break-inside:avoid}}
blockquote p:last-child{{margin-bottom:0}}
blockquote strong:first-child{{color:{GOLDINK}}}

table{{width:100%;border-collapse:collapse;margin:.85em 0;font-size:8.8pt;
       page-break-inside:auto}}
th,td{{border:1px solid {HAIR};padding:.42em .55em;text-align:left;vertical-align:top}}
thead th{{background:{INSET};font-family:'IBM Plex Mono',ui-monospace,monospace;
          font-weight:700;font-size:7.4pt;letter-spacing:.07em;text-transform:uppercase;
          color:{GOLDINK};border-color:{HAIRSTRONG}}}
tr{{page-break-inside:auto}}
thead{{display:table-header-group}}
table.wide{{font-size:7.8pt}}
table.wide th,table.wide td{{padding:.3em .38em}}
td code{{white-space:nowrap}}

/* --- figures --- */
p > img{{display:block;width:100%;border:1px solid {HAIRSTRONG};border-radius:.35rem}}
figure{{margin:1.1em 0;page-break-inside:avoid;break-inside:avoid}}
figure img{{display:block;width:100%;border:1px solid {HAIRSTRONG};border-radius:.35rem}}
figcaption{{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:7.4pt;
            letter-spacing:.05em;color:{GOLDINK};margin-top:.45em}}

/* --- the document-control table on the inside cover --- */
table.control{{font-size:9.4pt}}
table.control thead{{display:none}}
table.control td:first-child{{width:26%;background:{INSET};font-weight:600}}

/* --- cover --- */
.cover{{height:297mm;display:flex;flex-direction:column;background:{PAPER};
        border-top:5mm solid {NAVY};padding:0 22mm 20mm}}
.cover .top{{padding-top:20mm}}
.wordmark{{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:24pt;
           letter-spacing:.005em;line-height:1;display:inline-flex;gap:.36em}}
.wordmark .a{{color:{INK}}} .wordmark .v{{color:{GOLDINK}}}
.cover .mark{{width:34px;height:34px;margin-bottom:9mm}}
.cover .mark svg{{width:34px;height:34px}}
.cover h1.title{{border:0;padding:0;margin:0;page-break-before:auto;
                 font-size:46pt;line-height:1.02;letter-spacing:-.015em;max-width:13ch}}
.cover .sub{{font-family:Newsreader,Georgia,serif;font-size:19pt;color:{MUTED};
             margin-top:.35em;line-height:1.2}}
.cover .lede{{margin-top:9mm;max-width:34em;font-size:11pt;color:{MUTED};line-height:1.6}}
.cover .spacer{{flex:1}}
.proof{{display:flex;align-items:center;gap:1rem;margin:10mm 0 8mm;color:{GOLDINK};
        font-family:'IBM Plex Mono',monospace;font-size:15pt}}
.proof::before,.proof::after{{content:'';flex:1;border-top:1px solid {HAIRSTRONG}}}
.strap{{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:8.6pt;font-weight:700;
        letter-spacing:.14em;color:{GOLDINK};background:{GOLDTINT};
        border:1px solid {HAIRSTRONG};border-radius:.25rem;padding:.55em .8em;
        display:inline-block}}
.cover .foot{{margin-top:9mm;font-family:'IBM Plex Mono',monospace;font-size:8pt;
              letter-spacing:.06em;color:{MUTED};text-transform:uppercase;
              border-top:1px solid {HAIRSTRONG};padding-top:3mm}}

/* the manual's own title block is replaced by the cover */
.dropped{{display:none}}
"""

HEADER = f"""<div style="font-family:'IBM Plex Mono',monospace;font-size:6.5pt;letter-spacing:.08em;
 color:{MUTED};width:100%;padding:0 20mm;display:flex;justify-content:space-between;
 text-transform:uppercase;border-bottom:none;">
 <span>Craft A Bot &nbsp;·&nbsp; User Manual</span><span style="color:{GOLDINK}">Axiom Verity</span></div>"""

FOOTER = f"""<div style="font-family:'IBM Plex Mono',monospace;font-size:6.5pt;letter-spacing:.08em;
 color:{MUTED};width:100%;padding:0 20mm;display:flex;justify-content:space-between;">
 <span>v1.2 &nbsp;·&nbsp; 7 September 2026 &nbsp;·&nbsp; FOR SIMULATION ONLY</span>
 <span>page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>"""

# ---------- markdown ----------
src = io.open('MANUAL-FOR-PDF.md', encoding='utf-8').read()
src = re.sub(r'^<!--.*?-->\s*', '', src, count=1, flags=re.S)   # brand comment block

# split off the front matter (title + control table + notice + how-to-read) for the inside cover
body_start = src.index('# Contents')
front = src[:body_start]
body  = src[body_start:]

md = markdown.Markdown(extensions=['tables','fenced_code','sane_lists','attr_list','md_in_html'])

def render(text):
    md.reset()
    return md.convert(text)

front_html = render(front)
body_html  = render(body)

# drop the manual's own H1/H2 title pair — the cover carries it
front_html = re.sub(r'<h1>Craft A Bot</h1>\s*<h2>User Manual</h2>\s*<p>.*?</p>', '', front_html, count=1, flags=re.S)
# the control table
front_html = front_html.replace('<table>', '<table class="control">', 1)

def widen(html):
    out=[]; i=0
    while True:
        j = html.find('<table>', i)
        if j < 0:
            out.append(html[i:]); break
        k = html.find('</table>', j)
        block = html[j:k]
        cols = block.count('<th>')
        out.append(html[i:j])
        out.append('<table class="wide">' if cols >= 5 else '<table>')
        out.append(block[len('<table>'):])
        i = k
    return ''.join(out)
body_html_wide = True

# images -> figure/figcaption
def figurise(html):
    return re.sub(
        r'<p><img alt="([^"]*)" src="([^"]*)"\s*/?></p>',
        lambda m: f'<figure><img src="{m.group(2)}"><figcaption>{m.group(1)}</figcaption></figure>',
        html)
body_html = figurise(body_html)
body_html = widen(body_html)

# the first h1 in the body should not force a page break (Contents follows the inside cover)
body_html = body_html.replace('<h1>Contents</h1>', '<h1 class="first">Contents</h1>', 1)

cover = f"""<div class="cover">
  <div class="top">
    <div class="wordmark"><span class="a">Axiom</span><span class="v">Verity</span></div>
  </div>
  <div style="height:26mm"></div>
  <div class="mark">{MARK}</div>
  <h1 class="title">Craft&nbsp;A&nbsp;Bot</h1>
  <div class="sub">User Manual</div>
  <p class="lede">An LLM and agent simulator, and a proving ground for AI governance —
     including the UK Retail Financial Services Playground.</p>
  <div class="spacer"></div>
  <div class="proof">∴</div>
  <div><span class="strap">FOR SIMULATION ONLY</span></div>
  <div class="foot">Version 1.2 &nbsp;·&nbsp; 7 September 2026 &nbsp;·&nbsp; applies to <code style="border:0;background:none;padding:0;color:inherit">main</code> at 4acafc1 &nbsp;·&nbsp; draft for review</div>
</div>"""

def page(inner, klass=''):
    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>Craft A Bot — User Manual</title><style>{CSS}</style></head>
<body class="{klass}">{inner}</body></html>"""

io.open('cover.html','w',encoding='utf-8').write(page(cover))
io.open('body.html','w',encoding='utf-8').write(page(front_html + body_html))
io.open('_header.html','w',encoding='utf-8').write(HEADER)
io.open('_footer.html','w',encoding='utf-8').write(FOOTER)
print('html written')
