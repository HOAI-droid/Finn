import asyncio
from playwright.async_api import async_playwright
STUB="""
window.__spoken=[];
class U{constructor(t){this.text=t}}
window.SpeechSynthesisUtterance=U;
const syn={speaking:false,pending:false,getVoices(){return []},resume(){},cancel(){syn.speaking=false;if(syn.cur&&syn.cur.onerror)syn.cur.onerror({error:'interrupted'});syn.cur=null},
 speak(u){syn.cur=u;syn.speaking=true;window.__spoken.push(u.text);setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>{syn.speaking=false;u.onend&&u.onend()},300)},50)}};
Object.defineProperty(window,'speechSynthesis',{value:syn});
"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':420,'height':300})
        pg.on('pageerror',lambda e:print('ERR',e))
        await pg.add_init_script(STUB)
        await pg.goto('http://localhost:8765/index.html?mock=1')
        await pg.wait_for_function('window.chat',timeout=120000)
        await pg.evaluate("chat.say('Erzähl mir etwas über Sand')")
        await pg.wait_for_timeout(9000)
        print(await pg.evaluate('window.__spoken'))
        await pg.evaluate("window.__spoken=[];document.getElementById('read').click()")
        await pg.wait_for_timeout(8000)
        print(await pg.evaluate('window.__spoken'))
        await b.close()
asyncio.run(main())
