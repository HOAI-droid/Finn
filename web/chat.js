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
- Du darfst den Vornamen des Kindes benutzen. Frage nie nach Adresse, Nachnamen, Telefonnummer, Name der Schule oder Passwörtern.
- Stelle oft eine kurze Gegenfrage, damit das Gespräch weitergeht.
Beispiel: [happy] Hallo, ich bin Finn! Welches Tier magst du am liebsten?`;

// Feste Antworten für typische Alltagssätze (schnell, sicher, ohne Modell)
const RULES = [
  [/^(hallo|hi|hey|moin|servus|guten (tag|morgen|abend))\b/i, '[happy] Hallo! Schön, dass du da bist! Was wollen wir heute machen?'],
  [/wie hei(ß|ss)t du|wer bist du/i, '[happy] Ich bin Finn, ein Fennek! Meine großen Ohren hören alles.'],
  [/tsch(ü|u)ss|auf wiedersehen|bis (bald|später|morgen)/i, '[happy] Tschüss, {name}! Bis bald, ich freue mich auf dich!'],
  [/^danke|vielen dank/i, '[joy] Gern geschehen! Das mache ich doch gern.'],
  [/ich bin (müde|traurig)|mir geht.s nicht gut/i, '[sad] Oh, das tut mir leid. Sprich mit einem Erwachsenen, dem du vertraust, ja?'],
  [/wie geht.s|wie geht es dir/i, '[happy] Mir geht es super! Und dir?'],
];
const FALLBACKS = ['[thinking] Hmm, das weiß ich nicht genau. Erzähl mir mehr!', '[surprised] Oh, spannend! Magst du es noch einmal anders sagen?'];

const stripThink = (s) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/<\/?think>/g, '');
const EMOS = ['neutral', 'happy', 'joy', 'sad', 'surprised', 'thinking', 'worried', 'angry', 'sleepy'];

export class FennecChat {
  constructor(avatar, { mock = false, log = () => {}, status = () => {}, memory = null } = {}) {
    this.avatar = avatar; this.mock = mock; this.log = log; this.status = status; this.memory = memory;
    this.engine = null; this.history = []; this.queue = []; this.speaking = false; this.busy = false; this.muted = false; this._pid = 0;
    // aktive Nachfragen: nach einer Pause (ms) fragt Finn von sich aus etwas, höchstens maxNudges-mal ohne Antwort dazwischen
    this.nudgeAfter = 40000; this.maxNudges = 1; this.canNudge = () => true; this._nudges = 0; this._lastUser = 0;
    // laufendes Gespräch (< 30 min Pause) wieder aufnehmen
    if (memory) this.history = memory.recentTurns(8).map(t => ({ role: t.who === 'du' ? 'user' : 'assistant', content: t.text }));
  }
  _fill(t) { return this.memory ? this.memory.fill(t) : t.replace(/,?\s*\{name\}/g, ''); }

  /** Modell laden (einmalig; danach im Browser-Cache). onProgress({text, progress}) */
  async loadModel(modelId, onProgress = () => {}) {
    if (this.mock) { this.engine = mockEngine(); onProgress({ text: 'Mock-Modell bereit', progress: 1 }); this.summarize(); return 'mock'; }
    if (!navigator.gpu) throw new Error('Dieser Browser unterstützt WebGPU nicht. Bitte Chrome oder Edge am Computer verwenden.');
    const ad = await navigator.gpu.requestAdapter(); if (!ad) throw new Error('Keine passende Grafikeinheit (WebGPU) gefunden.');
    const m = MODELS.find(x => x.id === modelId) || MODELS[0];
    const id = ad.features.has('shader-f16') ? m.id : m.f32;
    const webllm = await import('./lib/web-llm.js');
    this.engine = await webllm.CreateMLCEngine(id, { initProgressCallback: onProgress });
    this.summarize();
    return id;
  }
  get ready() { return !!this.engine; }

  // ---------------------------------------------------------------- Antwort erzeugen und sprechen
  async say(userText) {
    userText = (userText || '').trim(); if (!userText || this.busy) return;
    this.busy = true;
    while (this._sumBusy) await new Promise(r => setTimeout(r, 200));   // Hintergrund-Zusammenfassung abwarten this.log('du', userText); this.avatar.stopSpeaking(); this.queue = [];
    clearTimeout(this._nt); this._nudges = 0; this._lastUser = Date.now();
    const mem = this.memory;
    this.history.push({ role: 'user', content: userText });
    try {
      let reply = null, found = [];
      if (mem) { mem.addTurn('du', userText); found = mem.observe(userText); reply = mem.answer(userText); }
      if (!reply && mem) reply = this._memoryRule(userText);
      if (!reply) { const rule = RULES.find(([re]) => re.test(userText)); if (rule) reply = this._fill(rule[1]); }
      if (!reply && !this.engine && found.some(f => f.kind === 'event')) reply = '[surprised] Oh, spannend! Das merke ich mir und frage dich danach, wie es war.';
      if (!reply && !this.engine && found.length) reply = '[happy] Aha, das merke ich mir!';
      if (reply) this._deliver(reply);
      else if (this.engine) await this._llm();
      else this._deliver(FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]);
    } catch (e) { this.log('fehler', String(e.message || e)); this.avatar.setEmotion('worried'); }
    finally { this.busy = false; }
  }
  _memoryRule(t) {
    const mem = this.memory;
    if (/^(hallo|hi|hey|moin|servus|guten (tag|morgen|abend))\b/i.test(t) && (!mem.name || !mem.greeted)) return mem.greeting();
    if (/wie hei(ß|ss)e ich|wer bin ich|kennst du mich|wei(ß|ss)t du (noch )?(wie|wer) ich/i.test(t)) return mem.name ? `[joy] Na klar! Du bist ${mem.name}.` : mem.greeting();
    if (/was wei(ß|ss)t du (alles )?(über|von) mir/i.test(t)) return mem.aboutYou() || mem.greeting();
    return null;
  }
  /** Finn begrüßt von sich aus (persönlich, mit Nachfrage; beim ersten Mal Kennenlern-Runde). */
  greet() {
    if (this.busy || !this.memory) return;
    this.stop(); this._lastUser = Date.now(); this._deliver(this.memory.greeting());
  }
  _armNudge() {
    clearTimeout(this._nt);
    if (!this.memory || this._nudges >= this.maxNudges || Date.now() - this._lastUser > 5 * 60e3) return;
    this._nt = setTimeout(() => {
      if (this.busy || this.speaking || this.queue.length || (typeof document !== 'undefined' && document.hidden) || !this.canNudge()) return this._armNudge();
      const r = this.memory.nudge(); if (!r) return;
      this._nudges++; this._deliver(r);
    }, this.nudgeAfter);
  }

  /** Frühere Gespräche mit dem Modell in einem Satz zusammenfassen (läuft im Hintergrund, wenn Finn frei ist). */
  async summarize() {
    const mem = this.memory; if (!mem || !this.engine || this._summing) return;
    this._summing = true;
    try {
      for (const s of mem.pendingSummaries().slice(-5)) {
        while (this.busy || this.speaking) await new Promise(r => setTimeout(r, 1000));
        this._sumBusy = true;
        try {
          const talk = s.turns.slice(-16).map(t => (t.who === 'du' ? 'Kind: ' : 'Finn: ') + t.text).join('\n');
          const out = await this.engine.chat.completions.create({ messages: [
            { role: 'system', content: 'Du fasst Gespräche zwischen einem Kind und dem Fennek Finn zusammen.' },
            { role: 'user', content: talk + '\n\nFasse in einem kurzen Satz zusammen, was das Kind erzählt hat oder worüber ihr gesprochen habt. Nur Fakten aus dem Gespräch.' }],
            max_tokens: 60, temperature: 0.2, extra_body: { enable_thinking: false } });
          const txt = stripThink(out.choices?.[0]?.message?.content || '').replace(/^\s*\[\w+\]\s*/, '').trim().split('\n')[0].slice(0, 200);
          mem.setSummary(s, txt);
        } finally { this._sumBusy = false; }
      }
    } catch (e) { console.warn('Zusammenfassung fehlgeschlagen', e); }
    finally { this._summing = false; }
  }

  async _llm() {
    this.avatar.setEmotion('thinking'); this.status('Finn denkt nach …');
    const ctx = this.memory ? this.memory.context() : '';
    const messages = [{ role: 'system', content: ctx ? SYSTEM + '\n\n' + ctx : SYSTEM }, ...this.history.slice(-9)];
    while (messages.length > 1 && messages[1].role !== 'user') messages.splice(1, 1);
    this.lastMessages = messages;
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
    this.history.push({ role: 'assistant', content: clean.trim() });
    this.memory?.addTurn('finn', body);
    this.log('finn', body); this.status('');
    return clean;
  }

  _deliver(text) {
    const m = text.match(/^\s*\[(\w+)\]\s*/); this._emotion(m ? m[1] : 'neutral');
    const body = text.replace(/\s*\[\w+\]\s*/g, ' ').trim(); this.log('finn', body);
    this.history.push({ role: 'assistant', content: text.trim() }); this.history = this.history.slice(-20);
    this.memory?.addTurn('finn', body);
    (body.match(/[^.!?]+[.!?]*/g) || [body]).map(s => s.trim()).filter(Boolean).forEach(s => this._enqueue(s));
  }
  _emotion(e) { e = (e || '').toLowerCase(); this.avatar.setEmotion(EMOS.includes(e) ? e : 'neutral'); }

  _enqueue(sentence) { this.queue.push(sentence); if (!this.muted) this.avatar.prefetch(sentence, 0.95); this._pump(); }
  _pump() {
    if (this.speaking || !this.queue.length) return;
    this.speaking = true; const t = this.queue.shift(); const my = ++this._pid;
    const done = () => { if (my !== this._pid) return; this._pid++; this.speaking = false; if (this.queue.length) this._pump(); else if (!this.busy) { this.avatar.setEmotion('neutral'); this._armNudge(); } };
    this.avatar.speak(t, { rate: 0.95, silent: this.muted, onend: done });
    setTimeout(done, 4000 + t.length * 160);   // Notbremse, falls der Browser das Ende nie meldet
  }
  stop() { this.queue = []; this._pid++; this.avatar.stopSpeaking(); this.speaking = false; clearTimeout(this._nt); }
}

// ---------------------------------------------------------------- Spracherkennung (Browser)
export class Listener {
  constructor(onText, onState = () => {}, lang = 'de-DE') {
    // In der Desktop-App (Electron) fehlt der Google-Dienst dahinter -> dort (noch) keine Spracheingabe
    const SR = navigator.userAgent.includes('Electron') ? null : window.SpeechRecognition || window.webkitSpeechRecognition;
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
  return { chat: { completions: { create: async (o) => {
    if (!o.stream) return { choices: [{ message: { content: 'Das Kind hat von seinem Tag erzählt.' } }] }; const a = answers[n++ % answers.length]; return (async function* () { for (let i = 0; i < a.length; i += 6) { await new Promise(r => setTimeout(r, 15)); yield { choices: [{ delta: { content: a.slice(i, i + 6) } }] }; } })(); } } } };
}
