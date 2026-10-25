import asyncio
from playwright.async_api import async_playwright
STUB=open('t_speak.py').read().split('STUB="""')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':420,'height':300})
        pg.on('pageerror',lambda e:print('ERR',e)); pg.on('console',lambda m:print('C',m.text[:300]) if m.type=='error' else None)
        await pg.add_init_script(STUB)
        await pg.goto('http://localhost:8765/index.html?mock=1')
        await pg.wait_for_function('window.chat',timeout=120000)
        await pg.select_option('#ltopic','colours'); await pg.select_option('#lmode','type'); await pg.click('#lstart')
        await pg.wait_for_timeout(2500)
        w=await pg.evaluate("document.getElementById('lq').textContent+' | '+document.getElementById('lhint').textContent")
        print(w, await pg.evaluate("__spoken"))
        # richtiges Wort aus Trainer lesen
        en=await pg.evaluate("'x'") 
        await pg.evaluate("__spoken=[]")
        await pg.fill('#lin','falsch'); await pg.click('#lcheck'); await pg.wait_for_timeout(800)
        print('nach falsch:', await pg.evaluate("__spoken"), await pg.inner_text('#lfb'), await pg.inner_text('#lhint'))
        await pg.evaluate("__spoken=[]")
        for i in range(3):
            en=await pg.evaluate("trainer.cur.en"); await pg.fill('#lin',en.upper()); await pg.click('#lcheck'); await pg.wait_for_timeout(3500)
            print('richtig',en, await pg.evaluate("__spoken"), await pg.inner_text('#lprog'))
        # wir kennen das Wort nicht -> über Fenster-Zugriff? Trainer nicht global; Hinweis nutzen
        await pg.screenshot(path='/home/claude/work/learn.png')
        await b.close()
asyncio.run(main())
