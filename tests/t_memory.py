# Gedächtnis: Kennenlernen, Speichern über Neuladen, Nachfrage zu Terminen, Kontext fürs Modell, aktive Nachfrage.
import asyncio
from playwright.async_api import async_playwright
STUB = open(__file__.replace('t_memory.py', 't_speak.py')).read().split('STUB="""')[1].split('"""')[0]
URL = 'http://localhost:8765/index.html?mock=1'
async def say(pg, t):
    await pg.evaluate('t => chat.say(t)', t)
    await pg.wait_for_function('!chat.busy && !chat.speaking && !chat.queue.length', timeout=30000)
    return await pg.evaluate("chat.history.filter(m => m.role === 'assistant').at(-1).content")
async def main():
    async with async_playwright() as p:
        import os; b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 420, 'height': 300})
        await ctx.add_init_script(STUB)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: print('ERR', e))
        await pg.goto(URL); await pg.wait_for_function('window.ready', timeout=120000)
        await pg.evaluate('memory.forget()')
        await pg.evaluate('chat.greet()'); await pg.wait_for_function('!chat.speaking && !chat.queue.length', timeout=30000)
        print('Begrüßung:', await pg.evaluate("chat.history.at(-1).content"))
        for a in ['Ich heiße Mia', 'acht', 'dritte Klasse', 'Pferde', 'Ich male gern']:
            print(' ', a, '->', await say(pg, a))
        print('Steckbrief:', await pg.evaluate('JSON.stringify(memory.profile)'))
        print(' ', await say(pg, 'Am Samstag habe ich ein Fußballturnier.'))
        assert await pg.evaluate("memory.facts.some(f => f.kind === 'event')")
        await pg.evaluate('memory.flush()')
        # neu laden: Gespräch läuft weiter, Steckbrief bleibt
        await pg.reload(); await pg.wait_for_function('window.ready', timeout=120000)
        assert await pg.evaluate('memory.name') == 'Mia'
        print('Verlauf nach Reload:', await pg.evaluate('chat.history.length'), 'Nachrichten')
        print(' wie heiße ich ->', await say(pg, 'Wie heiße ich?'))
        # eine Woche später: neues Gespräch, Nachfrage zum Turnier
        await pg.evaluate("""() => { const w = 7*864e5; memory.facts.forEach(f => { f.ts -= w; f.due -= w; }); memory.sessions.forEach(s => { s.start -= w; s.end -= w; s.turns.forEach(t => t.t -= w); }); return memory.flush(); }""")
        await pg.reload(); await pg.wait_for_function('window.ready', timeout=120000)
        print('Neue Sitzung, Begrüßung ->', await say(pg, 'Hallo Finn'))
        await pg.evaluate("document.getElementById('loadm').click()")
        await pg.wait_for_function("memory.sessions.some(s => s.summary)", timeout=20000)
        print('Zusammenfassung:', await pg.evaluate("memory.sessions.find(s => s.summary).summary"))
        print(' llm ->', await say(pg, 'Es war toll, wir haben gewonnen!'))
        sysmsg = await pg.evaluate('chat.lastMessages[0].content')
        assert 'Mia' in sysmsg and 'Fußballturnier' in sysmsg, sysmsg
        print('Kontext:\n' + sysmsg.split('\n\n')[-1])
        # aktive Nachfrage nach Pause
        await pg.evaluate('chat.nudgeAfter = 500; chat._armNudge()')
        await pg.wait_for_timeout(2500)
        print('Nachfrage:', await pg.evaluate("chat.history.at(-1).content"))
        await pg.evaluate("document.getElementById('memdet').open = true")
        await pg.wait_for_timeout(300)
        print('Elternbereich:', (await pg.evaluate("document.getElementById('memfacts').innerText")).replace('\n', ' | '))
        await b.close()
asyncio.run(main())
