import asyncio, subprocess
from playwright.async_api import async_playwright
U='http://localhost:8766/index.html?mock=1'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':420,'height':300}); pg=await ctx.new_page()
        reqs=[]; pg.on('request',lambda r:reqs.append(r.url.split('8766/')[1][:40]))
        pg.on('pageerror',lambda e:print('ERR',e)); pg.on('console',lambda m:print('C',m.text[:200]) if m.type=='error' else None)
        await pg.goto(U); await pg.wait_for_function('window.ready',timeout=120000)
        await pg.wait_for_function("document.getElementById('updtxt').textContent.startsWith('Version')",timeout=120000)
        print('1:',await pg.inner_text('#updtxt'))
        # neue Version: nur avatar.js ändern
        open('web/avatar.js','a').write('\n// test change\n'); subprocess.run(['node','tools/make-manifest.mjs','web','test2'])
        reqs.clear(); await pg.click('#updbtn'); await pg.wait_for_timeout(2000)
        print('2:',await pg.inner_text('#updtxt'),'|',await pg.inner_text('#updbtn'))
        await pg.click('#updbtn'); await pg.wait_for_function('window.ready',timeout=120000) if False else await pg.wait_for_timeout(4000)
        await pg.wait_for_function('window.ready',timeout=120000)
        big=[r for r in reqs if 'glb' in r or 'wasm' in r or r.startswith('lib/')]
        print('3: nachgeladen:',[r for r in reqs if not r.startswith('?')][:12],'| große Dateien erneut:',big)
        print('   Version jetzt:',await pg.evaluate("localStorage.getItem('finn-installed')&&JSON.parse(localStorage.getItem('finn-installed')).version"))
        # Offline-Test
        await ctx.set_offline(True); await pg.reload(); await pg.wait_for_function('window.ready',timeout=120000); print('4: offline läuft:',await pg.evaluate('window.ready'))
        await b.close()
asyncio.run(main())
