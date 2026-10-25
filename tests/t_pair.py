import asyncio, base64
from playwright.async_api import async_playwright
onnx=base64.b64encode(open('fake.onnx','rb').read()).decode(); js=open('fake.json').read()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':420,'height':300}); pg=await ctx.new_page()
        pg.on('pageerror',lambda e:print('ERR',e)); pg.on('console',lambda m:print('C',m.text[:200]) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html?mock=1'); await pg.wait_for_function('window.piper',timeout=120000)
        print('vorher:',await pg.inner_text('#vprog'))
        await pg.evaluate("""async([o,j])=>{const c=await caches.open('fennec-piper-v1');const B='https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';
          for(const p of ['de/de_DE/ramona/low/de_DE-ramona-low','en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium']){
            await c.put(B+p+'.onnx',new Response(Uint8Array.from(atob(o),c=>c.charCodeAt(0))));await c.put(B+p+'.onnx.json',new Response(j));}}""",[onnx,js])
        await pg.reload(); await pg.wait_for_function('window.piper',timeout=120000); await pg.wait_for_timeout(30000)
        print('nachher:',await pg.inner_text('#vprog'), await pg.evaluate("!!avatar.tts+' '+!!avatar.ttsEn+' '+avatar.voicePitch"))
        await b.close()
asyncio.run(main())
