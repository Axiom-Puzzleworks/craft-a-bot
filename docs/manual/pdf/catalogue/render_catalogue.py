import asyncio, pathlib, io
from playwright.async_api import async_playwright
from pypdf import PdfWriter, PdfReader

ROOT = pathlib.Path(__file__).parent.resolve()
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
    w.add_metadata({'/Title':'Craft A Bot — The Guardrail Catalogue',
                    '/Author':'Axiom Verity',
                    '/Subject':'Sixty-nine techniques for governing AI agents, and what Craft A Bot does with each',
                    '/Keywords':'AI governance, agent safety, simulation, UK retail financial services',
                    '/Creator':'Axiom Verity'})
    with open('Guardrail-Catalogue.pdf','wb') as fh:
        w.write(fh)
    print('pages:', len(PdfReader('Guardrail-Catalogue.pdf').pages))

asyncio.run(main())
