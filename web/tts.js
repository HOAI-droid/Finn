// Piper-TTS im Browser (ONNX/WASM, läuft lokal): Text -> Phoneme (espeak-ng WASM) -> VITS-Modell -> Audio
// Modelle kommen einmalig von Hugging Face und werden im Browser-Cache gespeichert.
const HF = ['https://huggingface.co/diffusionstudio/piper-voices/resolve/main/', 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'];

export const VOICES = [
  { id: 'de_DE-thorsten-medium',           path: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium',                  label: 'Thorsten (mittel, ca. 63 MB)' },
  { id: 'de_DE-thorsten_emotional-medium', path: 'de/de_DE/thorsten_emotional/medium/de_DE-thorsten_emotional-medium', label: 'Thorsten emotional (ca. 63 MB)' },
  { id: 'de_DE-thorsten-high',             path: 'de/de_DE/thorsten/high/de_DE-thorsten-high',                      label: 'Thorsten (hoch, ca. 110 MB)' },
  { id: 'de_DE-ramona-low',                path: 'de/de_DE/ramona/low/de_DE-ramona-low',                            label: 'Ramona (weiblich, klein)' },
  { id: 'de_DE-kerstin-low',               path: 'de/de_DE/kerstin/low/de_DE-kerstin-low',                          label: 'Kerstin (weiblich, klein)' },
  { id: 'en_GB-jenny_dioco-medium', lang: 'en', path: 'en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium', label: 'Jenny (britisch, weiblich)' },
  { id: 'en_US-amy-medium',         lang: 'en', path: 'en/en_US/amy/medium/en_US-amy-medium',                     label: 'Amy (amerikanisch, weiblich)' },
  { id: 'en_GB-alba-medium',        lang: 'en', path: 'en/en_GB/alba/medium/en_GB-alba-medium',                   label: 'Alba (britisch, schottisch)' },
  { id: 'en_US-lessac-medium',      lang: 'en', path: 'en/en_US/lessac/medium/en_US-lessac-medium',               label: 'Lessac (amerikanisch)' },
];

let ortP = null;
function loadOrt() {
  if (ortP) return ortP;
  ortP = new Promise((res, rej) => {
    if (window.ort) return res(window.ort);
    const s = document.createElement('script'); s.src = new URL('./lib/piper/ort.wasm.min.js', import.meta.url).href;
    s.onload = () => res(window.ort); s.onerror = () => rej(new Error('onnxruntime konnte nicht geladen werden')); document.head.appendChild(s);
  });
  return ortP;
}

async function cachedFetch(rel, onProgress) {
  const cache = await caches.open('fennec-piper-v1');
  for (const base of HF) {
    const url = base + rel;
    const hit = await cache.match(url); if (hit) return hit.arrayBuffer();
    try {
      const r = await fetch(url); if (!r.ok) continue;
      const total = +(r.headers.get('Content-Length') || 0), rd = r.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress && onProgress(got, total); }
      const buf = await new Blob(parts).arrayBuffer();
      try { await cache.put(url, new Response(buf.slice(0))); } catch (e) { /* Cache voll: egal */ }
      return buf;
    } catch (e) { /* nächste Quelle */ }
  }
  throw new Error('Stimme konnte nicht geladen werden (' + rel.split('/').pop() + ')');
}

/** Alles entfernen, was nicht gesprochen werden soll (Tags, Markdown, Emojis) */
export function cleanText(s) {
  s = (s || '').replace(/<[^>]*>/g, ' ').replace(/[*_#`~^|\\[\]{}<>]/g, ' ').replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').replace(/\s+/g, ' ').trim();
  return s || '.';
}

export class PiperTTS {
  constructor() { this.session = null; this.cfg = null; this.voice = null; this.chain = Promise.resolve(); this.memo = new Map(); this.speaker = 0; this.mod = null; }
  get ready() { return !!this.session; }

  async load(voiceId, onProgress = () => {}) {
    const v = VOICES.find(x => x.id === voiceId) || VOICES[0];
    const ort = await loadOrt();
    const base = new URL('./lib/piper/', import.meta.url).href;
    ort.env.wasm.wasmPaths = base; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    onProgress({ text: 'Lade Stimmen-Einstellungen …', progress: 0 });
    this.cfg = JSON.parse(new TextDecoder().decode(await cachedFetch(v.path + '.onnx.json')));
    const buf = await cachedFetch(v.path + '.onnx', (g, t) => onProgress({ text: 'Lade Stimme ' + Math.round(g / 1e6) + (t ? '/' + Math.round(t / 1e6) : '') + ' MB', progress: t ? g / t : 0 }));
    onProgress({ text: 'Starte Stimme …', progress: 1 });
    this.session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
    this.mod = await import('./lib/piper/phonemize.js');
    this.voice = v; this.memo.clear();
    await this.synth('Hallo.');                     // wärmt alles auf und zeigt Fehler sofort
    return v.id;
  }
  setSpeaker(name) { const m = this.cfg && this.cfg.speaker_id_map; this.speaker = m && name in m ? m[name] : 0; this.memo.clear(); }
  get speakers() { return this.cfg ? Object.keys(this.cfg.speaker_id_map || {}) : []; }

  async _phonemes(text) {
    const base = new URL('./lib/piper/', import.meta.url).href, ids = [];
    const m = await this.mod.createPiperPhonemize({
      print: (l) => { try { const j = JSON.parse(l); if (j.phoneme_ids) ids.push(...j.phoneme_ids); } catch (e) { /* keine JSON-Zeile */ } },
      printErr: () => {},
      locateFile: (f) => base + (f.endsWith('.wasm') ? 'piper_phonemize.wasm' : f.endsWith('.data') ? 'piper_phonemize.data' : f),
    });
    try { m.callMain(['-l', this.cfg.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']); } catch (e) { if (!ids.length) throw e; }
    const n = this.cfg.num_symbols || 130, ok = ids.filter(i => i < n);      // Laute, die das Modell nicht kennt, auslassen
    if (!ok.length) throw new Error('Keine Phoneme für: ' + text);
    return ok;
  }

  /** Liefert (zwischengespeichert, nacheinander abgearbeitet) { samples: Float32Array, rate } */
  synth(text, lengthScale = 1) {
    text = cleanText(text);
    const key = lengthScale + '|' + text; if (this.memo.has(key)) return this.memo.get(key);
    const p = this.chain.then(async () => {
      const ort = window.ort, c = this.cfg, ids = await this._phonemes(text);
      const feeds = { input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([c.inference.noise_scale, c.inference.length_scale * lengthScale, c.inference.noise_w]), [3]) };
      if (Object.keys(c.speaker_id_map || {}).length) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(this.speaker)]), [1]);
      const out = await this.session.run(feeds);
      return { samples: Float32Array.from(out.output.data), rate: c.audio.sample_rate };
    });
    this.chain = p.catch(() => {});
    this.memo.set(key, p); if (this.memo.size > 40) this.memo.delete(this.memo.keys().next().value);
    p.catch(() => this.memo.delete(key));
    return p;
  }
}
