import asyncio, pathlib, io
from playwright.async_api import async_playwright
from pypdf import PdfWriter, PdfReader

ROOT = pathlib.Path('.').resolve()
HEADER = (ROOT/'_header.html').read_text(encoding='utf-8')
FOOTER = (ROOT/'_footer.html').read_text(encoding='utf-8')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        pg = await b.new_page()

        await pg.goto((ROOT/'cover.html').as_uri(), wait_until='networkidle')
        await pg.emulate_media(media='print')
        await pg.pdf(path='cover.pdf', format='A4', print_background=True,
                     margin={'top':'0','bottom':'0','left':'0','right':'0'})

        await pg.goto((ROOT/'body.html').as_uri(), wait_until='networkidle')
        await pg.emulate_media(media='print')
        await pg.pdf(path='body.pdf', format='A4', print_background=True,
                     display_header_footer=True,
                     header_template=HEADER, footer_template=FOOTER,
                     margin={'top':'18mm','bottom':'16mm','left':'20mm','right':'20mm'})
        await b.close()

    w = PdfWriter()
    for f in ('cover.pdf','body.pdf'):
        for page in PdfReader(f).pages:
            w.add_page(page)
    w.add_metadata({'/Title':'Craft A Bot — User Manual',
                    '/Author':'Axiom Verity',
                    '/Subject':'An LLM and agent simulator, and a proving ground for AI governance',
                    '/Keywords':'AI governance, agent safety, simulation, UK retail financial services',
                    '/Creator':'Axiom Verity'})
    with open('Craft-A-Bot-User-Manual.pdf','wb') as fh:
        w.write(fh)
    print('pages:', len(PdfReader('Craft-A-Bot-User-Manual.pdf').pages))

asyncio.run(main())
