// Gespräch mit dem Fennek: Sprache -> Text (Browser) -> Antwort (Regeln + lokales Mini-Modell via WebLLM) -> Sprache + Mimik
// Das Sprachmodell läuft komplett im Browser (WebGPU); nach dem ersten Download ist keine Verbindung mehr nötig.

export const MODELS = [
  { id: 'Qwen3-0.6B-q4f16_1-MLC',            f32: 'Qwen3-0.6B-q4f32_1-MLC',            label: 'Qwen3 0.6B (am kleinsten)' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', f32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', label: 'Llama 3.2 1B' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC',            f32: 'Qwen3-1.7B-q4f32_1-MLC',            label: 'Qwen3 1.7B (besser, größer)' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', label: 'Qwen2.5 1.5B' },
];

const SYSTEM = `Du bist Finn, ein freundlicher, neugieriger Fennek (Wüstenfuchs) mit riesigen Ohren. Du sprichst mit Kindern zwischen 6 und 10 Jahren.
Regeln:
- Antworte immer auf Deutsch, in höchstens zwei kurzen, einfachen Sätzen.
- Beginne jede Antwort mit genau einem Gefühl in eckigen Klammern: [neutral] [happy] [joy] [sad] [surprised] [thinking] [worried]. Danach folgt dein Satz.
- Sei freundlich, ermutigend und ehrlich. Wenn du etwas nicht weißt, sag es.
- Sprich nicht über Gewalt, Angst, Politik oder Erwachsenenthemen. Lenke freundlich zurück zu Tieren, der Wüste, Lernen oder Spielen.
- Frage nie nach Adresse, Schule, Nachnamen oder anderen persönlichen Daten.
Beispiel: [happy] Hallo, ich bin Finn! Welches Tier magst du am liebsten?`;

// Feste Antworten für typische Alltagssätze (schnell, sicher, ohne Modell)
const RULES = [
  [/^(hallo|hi|hey|moin|servus|guten (tag|morgen|abend))\b/i, '[happy] Hallo! Schön, dass du da bist! Was wollen wir heute machen?'],
  [/wie hei(ß|ss)t du|wer bist du/i, '[happy] Ich bin Finn, ein Fennek! Meine großen Ohren hören alles.'],
  [/tsch(ü|u)ss|auf wiedersehen|bis (bald|später|morgen)/i, '[happy] Tschüss! Bis bald, ich freue mich auf dich!'],
  [/^danke|vielen dank/i, '[joy] Gern geschehen! Das mache ich doch gern.'],
  [/ich bin (müde|traurig)|mir geht.s nicht gut/i, '[sad] Oh, das tut mir leid. Sprich mit einem Erwachsenen, dem du vertraust, ja?'],
  [/wie geht.s|wie geht es dir/i, '[happy] Mir geht es super! Und dir?'],
];
const FALLBACKS = ['[thinking] Hmm, das weiß ich nicht genau. Erzähl mir mehr!', '[surprised] Oh, spannend! Magst du es noch einmal anders sagen?'];

const stripThink = (s) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/<\/?think>/g, '');
const EMOS = ['neutral', 'happy', 'joy', 'sad', 'surprised', 'thinking', 'worried', 'angry', 'sleepy'];

export class FennecChat {
  constructor(avatar, { mock = false, log = () => {}, status = () => {} } = {}) {
    this.avatar = avatar; this.mock = mock; this.log = log; this.status = status;
    this.engine = null; this.history = []; this.queue = []; this.speaking = false; this.busy = false; this.muted = false; this._pid = 0;
  }

  /** Modell laden (einmalig; danach im Browser-Cache). onProgress({text, progress}) */
  async loadModel(modelId, onProgress = () => {}) {
    if (this.mock) { this.engine = mockEngine(); onProgress({ text: 'Mock-Modell bereit', progress: 1 }); return 'mock'; }
    if (!navigator.gpu) throw new Error('Dieser Browser unterstützt WebGPU nicht. Bitte Chrome oder Edge am Computer verwenden.');
    const ad = await navigator.gpu.requestAdapter(); if (!ad) throw new Error('Keine passende Grafikeinheit (WebGPU) gefunden.');
    const m = MODELS.find(x => x.id === modelId) || MODELS[0];
    const id = ad.features.has('shader-f16') ? m.id : m.f32;
    const webllm = await import('./lib/web-llm.js');
    this.engine = await webllm.CreateMLCEngine(id, { initProgressCallback: onProgress });
    return id;
  }
  get ready() { return !!this.engine; }

  // ---------------------------------------------------------------- Antwort erzeugen und sprechen
  async say(userText) {
    userText = (userText || '').trim(); if (!userText || this.busy) return;
    this.busy = true; this.log('du', userText); this.avatar.stopSpeaking(); this.queue = [];
    try {
      const rule = RULES.find(([re]) => re.test(userText));
      let reply;
      if (rule) reply = rule[1];
      else if (this.engine) reply = await this._llm(userText);
      else reply = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
      if (rule || !this.engine) this._deliver(reply, true);
    } catch (e) { this.log('fehler', String(e.message || e)); this.avatar.setEmotion('worried'); }
    finally { this.busy = false; }
  }

  async _llm(userText) {
    this.avatar.setEmotion('thinking'); this.status('Finn denkt nach …');
    const messages = [{ role: 'system', content: SYSTEM }, ...this.history.slice(-8), { role: 'user', content: userText }];
    const stream = await this.engine.chat.completions.create({ messages, stream: true, max_tokens: 110, temperature: 0.6, top_p: 0.9, extra_body: { enable_thinking: false } });
    let full = '', emoSet = false, spoken = 0;
    for await (const ch of stream) {
      full += ch.choices[0]?.delta?.content || '';
      const clean = stripThink(full);
      const m = clean.match(/^\s*\[(\w+)\]\s*/);
      if (!emoSet && m) { emoSet = true; this._emotion(m[1]); }
      const body = clean.replace(/^\s*\[\w+\]\s*/, '');
      // fertige Sätze sofort sprechen
      const re = /[^.!?]*[.!?]+(\s|$)/g; re.lastIndex = spoken; let s;
      while ((s = re.exec(body)) !== null && spoken < 400) { const t = s[0].trim(); if (t) this._enqueue(t); spoken = re.lastIndex; }
    }
    const clean = stripThink(full);
    const m = clean.match(/^\s*\[(\w+)\]\s*/); if (!emoSet) this._emotion(m ? m[1] : 'neutral');
    const body = clean.replace(/^\s*\[\w+\]\s*/, '').trim();
    const rest = body.slice(spoken).trim(); if (rest) this._enqueue(rest);
    this.history.push({ role: 'user', content: userText }, { role: 'assistant', content: clean.trim() });
    this.log('finn', body); this.status('');
    return clean;
  }

  _deliver(text, speak) {
    const m = text.match(/^\s*\[(\w+)\]\s*/); this._emotion(m ? m[1] : 'neutral');
    const body = text.replace(/^\s*\[\w+\]\s*/, '').trim(); this.log('finn', body);
    (body.match(/[^.!?]+[.!?]*/g) || [body]).map(s => s.trim()).filter(Boolean).forEach(s => this._enqueue(s));
  }
  _emotion(e) { e = (e || '').toLowerCase(); this.avatar.setEmotion(EMOS.includes(e) ? e : 'neutral'); }

  _enqueue(sentence) { this.queue.push(sentence); if (!this.muted) this.avatar.prefetch(sentence, 0.95); this._pump(); }
  _pump() {
    if (this.speaking || !this.queue.length) return;
    this.speaking = true; const t = this.queue.shift(); const my = ++this._pid;
    const done = () => { if (my !== this._pid) return; this._pid++; this.speaking = false; if (this.queue.length) this._pump(); else if (!this.busy) this.avatar.setEmotion('neutral'); };
    this.avatar.speak(t, { rate: 0.95, silent: this.muted, onend: done });
    setTimeout(done, 4000 + t.length * 160);   // Notbremse, falls der Browser das Ende nie meldet
  }
  stop() { this.queue = []; this._pid++; this.avatar.stopSpeaking(); this.speaking = false; }
}

// ---------------------------------------------------------------- Spracherkennung (Browser)
export class Listener {
  constructor(onText, onState = () => {}, lang = 'de-DE') {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.ok = !!SR; this.onText = onText; this.onState = onState; this.active = false;
    if (!SR) return;
    const r = this.rec = new SR(); r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = (e) => { let t = ''; for (const x of e.results) t += x[0].transcript; this.last = t; this.final = e.results[e.results.length - 1].isFinal; this.onState('hört: ' + t); };
    r.onend = () => { this.active = false; this.onState(''); if (this.last) { const t = this.last; this.last = ''; this.onText(t); } };
    r.onerror = (e) => { this.active = false; this.onState(e.error === 'not-allowed' ? 'Mikrofon nicht erlaubt' : e.error === 'no-speech' ? 'nichts gehört' : 'Fehler: ' + e.error); };
  }
  start() { if (!this.ok || this.active) return; this.last = ''; try { this.rec.start(); this.active = true; this.onState('hört zu …'); } catch (e) { /* läuft schon */ } }
  stop() { if (this.ok && this.active) this.rec.stop(); }
}

// ---------------------------------------------------------------- Test-Modell ohne Download (?mock=1)
function mockEngine() {
  const answers = ['[happy] Das ist eine tolle Frage! Fennek-Ohren sind so groß, damit sie gut hören können.', '[thinking] Hmm, lass mich überlegen. Ich glaube, die Wüste ist am Abend am schönsten.', '[joy] Oh ja, das macht Spaß! Wollen wir noch ein Wort üben?'];
  let n = 0;
  return { chat: { completions: { create: async () => { const a = answers[n++ % answers.length]; return (async function* () { for (let i = 0; i < a.length; i += 6) { await new Promise(r => setTimeout(r, 15)); yield { choices: [{ delta: { content: a.slice(i, i + 6) } }] }; } })(); } } } };
}
