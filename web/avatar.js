// FennecAvatar – sprechender Fennek-Avatar (three.js)
// Gesicht: Overlay-Meshes mit Atlas-Texturen (Augen, Brauen, Mund); Körper: Mixamo-Skelett; Ohren: eigene Bones.
// "left"/"right" in der API meinen immer die linke/rechte Seite DER FIGUR (nicht die des Betrachters).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const san = (n) => n.replace(/:/g, '');

// ---------------------------------------------------------------- Text -> Visemes (Deutsch, heuristisch)
const VOW = { a: 'aa', e: 'E', i: 'I', o: 'O', u: 'U', 'ä': 'E', 'ö': 'O', 'ü': 'U', y: 'U' };
const CON = { p: 'PP', b: 'PP', m: 'PP', f: 'FF', v: 'FF', w: 'FF', s: 'SS', z: 'SS', 'ß': 'SS', t: 'DD', d: 'DD', n: 'nn', l: 'DD',
  k: 'kk', g: 'kk', q: 'kk', x: 'kk', r: 'RR', j: 'I', h: 'nn', c: 'kk' };
export function textToTimeline(text, rate = 1) {
  const s = text.toLowerCase();
  const out = []; let t = 0;
  const push = (v, dur, ci) => { dur /= rate; out.push({ t, dur, v, ci }); t += dur; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i], c2 = s.substr(i, 2), c3 = s.substr(i, 3);
    if (c3 === 'sch') { push('CH', .09, i); i += 2; continue; }
    if (c2 === 'ch') { push('CH', .08, i); i += 1; continue; }
    if (c2 === 'pf') { push('PP', .05, i); push('FF', .05, i + 1); i += 1; continue; }
    if (c2 === 'th') { push('TH', .07, i); i += 1; continue; }
    if (c2 === 'ei' || c2 === 'ai') { push('aa', .09, i); push('I', .08, i + 1); i += 1; continue; }
    if (c2 === 'eu' || c2 === 'äu') { push('O', .09, i); push('I', .08, i + 1); i += 1; continue; }
    if (c2 === 'ie') { push('I', .12, i); i += 1; continue; }
    if (c2 === 'au') { push('aa', .09, i); push('U', .08, i + 1); i += 1; continue; }
    if (VOW[c]) { push(VOW[c], .115, i); continue; }
    if (CON[c]) { push(CON[c], .065, i); continue; }
    if (/\s/.test(c)) { push('sil', .07, i); continue; }
    if (',;:'.includes(c)) { push('sil', .18, i); continue; }
    if ('.!?'.includes(c)) { push('sil', .32, i); continue; }
  }
  // gleiche Nachbarn zusammenfassen
  const m = [];
  for (const u of out) { const l = m[m.length - 1]; if (l && l.v === u.v && u.v === 'sil') { l.dur += u.dur; } else m.push({ ...u }); }
  return { units: m, total: t };
}

// ---------------------------------------------------------------- Emotionen
const EMOTIONS = {
  neutral:   { eyes: 'open', browL: 'neutral', browR: 'neutral', mouth: 'sil', ears: [0, 0] },
  happy:     { eyes: 'open', browL: 'up', browR: 'up', mouth: 'smile', ears: [.6, 0] },
  joy:       { eyes: 'happy', browL: 'up', browR: 'up', mouth: 'laugh', ears: [.8, 0] },
  sad:       { eyes: 'sad', browL: 'sad', browR: 'sad', mouth: 'frown', ears: [-1, 0] },
  surprised: { eyes: 'surprised', browL: 'high', browR: 'high', mouth: 'surprised', ears: [1, 0] },
  angry:     { eyes: 'angry', browL: 'angry', browR: 'angry', mouth: 'frown', ears: [-.7, 0] },
  thinking:  { eyes: 'open', browL: 'skeptic', browR: 'neutral', mouth: 'PP', ears: [.2, 0], gaze: [-.8, .8] },
  worried:   { eyes: 'open', browL: 'worried', browR: 'worried', mouth: 'frown', ears: [-.5, 0] },
  sleepy:    { eyes: 'sleepy', browL: 'down', browR: 'down', mouth: 'sil', ears: [-.9, 0] },
};

export class FennecAvatar {
  constructor() {
    this.root = null; this.mixer = null; this.clips = {}; this.action = null;
    this.meta = null; this.parts = {}; this.bones = {};
    this.t = 0;
    this.state = { eyes: 'open', browL: 'neutral', browR: 'neutral', mouth: 'sil', gx: 0, gy: 0 };
    this.emotion = 'neutral'; this.emo = EMOTIONS.neutral;
    this.blink = { next: 2, phase: -1, t: 0 };
    this.earBase = { L: 0, R: 0 }; this.earFlick = { L: 0, R: 0, nextL: 4, nextR: 7 };
    this.earTarget = [0, 0]; this.earCur = [0, 0];
    this.speech = null; this.audioAn = null; this.talkAmt = 0;
    this.gazeTarget = [0, 0]; this.nextSaccade = 1.5; this.gazeUser = null;
    this.earAxes = { a: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 0, 1) };
    this.autoBlink = true; this.autoEars = true; this.autoIdle = true;
    this.eyeBase = { left: 'open', right: 'open' }; this.eyeNow = { left: 'open', right: 'open' };
    this.headExtra = { pitch: 0, yaw: 0, roll: 0 }; this.script = null; this.onWord = null;
    this._sid = 0; this._wordOffset = 0; this._utt = null; this.tts = null; this.ttsEn = null; this.voicePitch = 1; this._src = null;
  }

  async load(glbUrl = './fennec_avatar.glb', metaUrl = './atlas_meta.json') {
    const [gltf, meta] = await Promise.all([new GLTFLoader().loadAsync(glbUrl), fetch(metaUrl).then(r => r.json())]);
    this.meta = meta; this.root = gltf.scene;
    this.root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.frustumCulled = false; }
      if (o.isBone) this.bones[o.name] = o;
      if (o.name && o.name.startsWith('Face_')) this.parts[o.name] = o;
    });
    // Überlagerungen: eigene Textur-Instanz je Mesh, Alpha-Blend, vor der Haut zeichnen
    for (const [n, m] of Object.entries(this.parts)) {
      const mat = m.material; mat.map = mat.map.clone(); mat.map.needsUpdate = true;
      mat.transparent = true; mat.depthWrite = false; mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
      m.renderOrder = n.includes('Brow') ? 7 : n.includes('Eye') ? 6 : 5;
      mat.map.matrixAutoUpdate = true;
    }
    this.clips = {}; for (const c of gltf.animations) this.clips[c.name] = c;
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const k of ['Ear_L_1', 'Ear_L_2', 'Ear_L_3', 'Ear_R_1', 'Ear_R_2', 'Ear_R_3', 'mixamorigHead', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigNeck']) {
      const b = this.bones[k]; if (b) b.userData.rest = b.quaternion.clone();
    }
    this.root.updateMatrixWorld(true);
    this.earRw = { L: [], R: [] };
    for (const sd of ['L', 'R']) for (let i = 1; i <= 3; i++) { const b = this.bones[`Ear_${sd}_${i}`]; const q = new THREE.Quaternion(); if (b) b.parent.getWorldQuaternion(q); this.earRw[sd].push(q); }
    this.setEyes('open'); this.setBrows('neutral', 'neutral'); this.setMouth('sil'); this.setGaze(0, 0);
    return this;
  }

  // ------------------------------------------------------------ Atlas-Zellen
  _cell(part, kind, col, row) {
    const m = this.parts[part]; if (!m) return;
    const a = this.meta[kind]; const [cw, ch] = a.cell; const aw = cw * a.cols, ah = ch * a.rows; const [dc, dr] = a.default;
    m.material.map.offset.set(((col - dc) * cw) / aw, ((row - dr) * ch) / ah);
  }
  _idx(kind, name) { const i = this.meta[kind].states.indexOf(name); return i < 0 ? 0 : i; }

  /** Augenzustand: open half blink closed happy sad angry sleepy surprised  (side: 'both' | 'left' | 'right' – Seite der Figur) */
  setEyes(name, side = 'both') {
    if (side !== 'right') this.eyeBase.left = name;
    if (side !== 'left') this.eyeBase.right = name;
    this.state.eyes = this.eyeBase.left; this.eyeNow = { ...this.eyeBase }; this._renderEyes();
  }
  _renderEyes() {
    const gx = Math.round(clamp(this.state.gx, -1, 1) * 1.2), gy = -Math.round(clamp(this.state.gy, -1, 1) * 1.2);
    const rowFor = (x, y) => (clamp(y, -1, 1) + 1) * 3 + (clamp(x, -1, 1) + 1);
    // Figur-links = Mesh "Face_EyeR" (Betrachter rechts, gespiegelte Zelle); Figur-rechts = "Face_EyeL"
    this._cell('Face_EyeL', 'eyes', this._idx('eyes', this.eyeNow.right), rowFor(gx, gy));
    this._cell('Face_EyeR', 'eyes', this._idx('eyes', this.eyeNow.left), rowFor(-gx, gy));
  }
  /** Blick: x -1..1 (Betrachter-rechts = +), y -1..1 (oben = +) */
  setGaze(x, y) { this.state.gx = x; this.state.gy = y; this._renderEyes(); }
  /** Brauen: neutral up high down angry sad worried skeptic (links/rechts der Figur) */
  setBrows(left, right = left) {
    this.state.browL = left; this.state.browR = right;
    this._cell('Face_BrowR', 'brows', this._idx('brows', left) % 4, Math.floor(this._idx('brows', left) / 4));
    this._cell('Face_BrowL', 'brows', this._idx('brows', right) % 4, Math.floor(this._idx('brows', right) / 4));
  }
  /** Mund / Viseme: sil PP FF TH DD kk CH SS nn RR aa E I O U smile laugh frown surprised */
  setMouth(name) {
    this.state.mouth = name; const i = this._idx('mouth', name); const cols = this.meta.mouth.cols;
    this._cell('Face_Mouth', 'mouth', i % cols, Math.floor(i / cols));
  }

  setEmotion(name) {
    const e = EMOTIONS[name]; if (!e) return; this.emotion = name; this.emo = e;
    this.setEyes(e.eyes); this.setBrows(e.browL, e.browR);
    if (!this.speech && !this.audioAn) this.setMouth(e.mouth);
    this.earTarget = [e.ears[0], e.ears[1]];
    this.gazeUser = e.gaze || null; if (e.gaze) this.setGaze(e.gaze[0], e.gaze[1]);
  }
  get emotions() { return Object.keys(EMOTIONS); }

  // ------------------------------------------------------------ Reaktionen (kleine Szenen)
  _restore() { const e = this.emo; this.setEyes(e.eyes); this.setBrows(e.browL, e.browR); if (!this.speech) this.setMouth(e.mouth); this.gazeUser = e.gaze || null; this.setGaze(e.gaze ? e.gaze[0] : 0, e.gaze ? e.gaze[1] : 0); this.earTarget = [...e.ears]; }
  get reactions() { return ['eyeroll', 'shake', 'nod', 'giggle', 'wink', 'oops', 'think']; }
  /** Reaktionen: eyeroll shake nod giggle wink oops think */
  react(name, done) {
    const T = this.t; const A = this; const sc = (steps, end, update) => { A.script = { t0: T, steps, i: 0, end, update, done: () => { A._restore(); if (done) done(); } }; };
    if (name === 'eyeroll') {
      const path = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
      A.gazeUser = [0, 0];
      const st = [[0, () => { A.setBrows('skeptic', 'neutral'); A.setMouth('PP'); A.setEyes('half'); A.earTarget = [-.8, 0]; }]];
      path.forEach((g, i) => st.push([.12 + i * .13, () => { A.setEyes('open'); A.setGaze(g[0], g[1]); }]));
      st.push([1.15, () => { A.setEyes('half'); A.setGaze(0, 0); }]);
      sc(st, 1.9, (tt) => { A.headExtra.roll = Math.sin(Math.min(tt, 1.2) / 1.2 * Math.PI) * .12; A.headExtra.pitch = Math.sin(Math.min(tt, 1.2) / 1.2 * Math.PI) * -.08; });
    } else if (name === 'shake') {
      sc([[0, () => { A.setBrows('sad', 'sad'); A.setMouth('frown'); A.setEyes('sad'); A.earTarget = [-.7, 0]; }]], 1.1, (tt) => { A.headExtra.yaw = Math.sin(tt * 14) * .22 * Math.max(0, 1 - tt / 1.1); });
    } else if (name === 'nod') {
      sc([[0, () => { A.setBrows('up', 'up'); A.setMouth('smile'); A.earTarget = [.6, 0]; }]], 1.0, (tt) => { A.headExtra.pitch = Math.sin(tt * 11) * .13 * Math.max(0, 1 - tt); });
    } else if (name === 'giggle') {
      sc([[0, () => { A.setEyes('happy'); A.setBrows('up', 'up'); A.setMouth('laugh'); A.earTarget = [1, 0]; }], [.35, () => A.setMouth('smile')], [.6, () => A.setMouth('laugh')], [.95, () => A.setMouth('smile')]], 1.5,
        (tt) => { A.headExtra.pitch = Math.sin(tt * 16) * .05; A.earFlick.tL = T + tt - .2; A.earFlick.tR = T + tt - .2; });
    } else if (name === 'wink') {
      sc([[0, () => { A.setEyes('closed', 'right'); A.setMouth('smile'); A.setBrows('neutral', 'up'); }], [.5, () => A.setEyes('open')]], 1.0, (tt) => { A.headExtra.roll = Math.sin(Math.min(tt, .5) / .5 * Math.PI) * .09; });
    } else if (name === 'oops') {
      sc([[0, () => { A.setEyes('surprised'); A.setBrows('high', 'high'); A.setMouth('O'); A.earTarget = [1, 0]; }], [.8, () => { A.setEyes('open'); A.setBrows('worried', 'worried'); A.setMouth('frown'); A.earTarget = [-.6, 0]; }]], 1.8);
    } else if (name === 'think') {
      A.gazeUser = [-.8, .8];
      sc([[0, () => { A.setEyes('open'); A.setBrows('skeptic', 'neutral'); A.setMouth('PP'); A.setGaze(-1, 1); }]], 2.2, (tt) => { A.headExtra.roll = .08; });
    }
  }

  // ------------------------------------------------------------ Körper-Animationen (Mixamo-Clips)
  get bodyAnimations() { return Object.keys(this.clips); }
  playBody(name, fade = 0.3) {
    const clip = this.clips[name]; if (!clip) return this.stopBody(fade);
    const next = this.mixer.clipAction(clip); next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    if (this.action && this.action !== next) this.action.fadeOut(fade);
    this.action = next;
  }
  stopBody(fade = 0.3) { if (this.action) { this.action.fadeOut(fade); this.action = null; } }

  // ------------------------------------------------------------ Sprechen
  /** Sprechen mit Browser-TTS; die Mundbewegung folgt dem Text (an Wortgrenzen nachsynchronisiert). */
  speak(text, { lang = 'de-DE', rate = 1, pitch = 1.1, silent = false, onend } = {}) {
    const tl = textToTimeline(text, rate);
    const id = ++this._sid;                       // macht alle Rückrufe älterer Ansagen wirkungslos
    this.speech = null;
    const finish = () => { if (id !== this._sid) return; this.speech = null; this.setMouth(this.emo.mouth); if (onend) onend(); };
    const eng = /^en/i.test(lang), engine = eng ? this.ttsEn : this.tts;
    if (!silent && engine) return this._speakTTS(text, tl, id, finish, rate, engine, eng);
    if (silent || !('speechSynthesis' in window)) { this.speech = { tl, t0: this.t, onend: finish, auto: true }; return; }
    const synth = window.speechSynthesis;
    const wasBusy = synth.speaking || synth.pending;
    if (wasBusy) synth.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate; u.pitch = pitch;
    const v = synth.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    this._utt = u;                                 // Referenz halten (Chrome verliert sonst gelegentlich das Ende-Ereignis)
    let started = false; const dead = () => id !== this._sid || u._dead;
    u.onstart = () => { if (dead()) return; started = true; this.speech = { tl, t0: this.t, onend: finish, auto: false }; };
    u.onboundary = (e) => {
      if (dead() || !this.speech) return;
      const k = tl.units.find(x => x.ci >= e.charIndex); if (k) this.speech.t0 = this.t - k.t;
      if (this.onWord) this.onWord(e.charIndex + this._wordOffset, e.charLength || 0);
    };
    u.onend = () => { if (dead()) return; if (this.speech) { this.speech.auto = true; this.speech.endAt = this.t; } else finish(); };
    u.onerror = (e) => {
      if (dead() || (e && (e.error === 'interrupted' || e.error === 'canceled'))) return;
      this.speech = { tl, t0: this.t, onend: finish, auto: true };   // Ausgabe fehlgeschlagen: wenigstens der Mund läuft
    };
    const go = () => {
      if (dead()) return;
      try { synth.resume(); } catch (e) { /* egal */ }
      synth.speak(u);
      setTimeout(() => {                           // Notbremse: startet die Ausgabe nicht, läuft nur der Mund weiter
        if (!dead() && !started) { u._dead = true; synth.cancel(); this.speech = { tl, t0: this.t, onend: finish, auto: true }; }
      }, 3500);
    };
    if (wasBusy) setTimeout(go, 150); else go();
  }
  /** Sprechen mit einer Piper-/Neuro-Stimme (this.tts.synth -> {samples, rate}); Mundbewegung wird auf die echte Audiolänge gestreckt. */
  async _speakTTS(text, tl, id, finish, rate, engine, eng) {
    try {
      let r; try { r = await engine.synth(text, (this.voicePitch || 1) / (rate || 1)); } catch (e1) { r = await engine.synth(text, (this.voicePitch || 1) / (rate || 1)); }
      if (id !== this._sid) return;
      const ctx = this._actx || (this._actx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') await ctx.resume();
      if (id !== this._sid) return;
      const buf = ctx.createBuffer(1, r.samples.length, r.rate); buf.copyToChannel(r.samples, 0);
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = this.voicePitch || 1;
      const g = ctx.createGain(); g.gain.value = 1; src.connect(g); g.connect(ctx.destination);
      // führende/abschließende Stille grob abschneiden, damit Mund und Ton zusammenpassen
      let a = 0, b = r.samples.length; const th = 0.01;
      while (a < b && Math.abs(r.samples[a]) < th) a++; while (b > a && Math.abs(r.samples[b - 1]) < th) b--;
      const lead = Math.max(0, a / r.rate - 0.03), dur = Math.max(0.2, (b - a) / r.rate / src.playbackRate.value);
      const k = dur / (tl.total || 1);
      let tl2 = { units: tl.units.map(u => ({ ...u, t: u.t * k, dur: u.dur * k })), total: dur };
      if (eng) {                                   // Englisch: Mundform aus der Lautstärkekurve (deutsche Buchstabenregeln passen nicht)
        const w = Math.round(.065 * r.rate), n = Math.max(1, Math.floor((b - a) / w)), lv = [];
        for (let i = 0; i < n; i++) { let e = 0; for (let j = a + i * w; j < a + (i + 1) * w; j++) e += r.samples[j] * r.samples[j]; lv.push(Math.sqrt(e / w)); }
        const mx = Math.max(...lv, 1e-6), hi = ['aa', 'O', 'aa', 'U'], mid = ['E', 'I', 'E', 'nn']; let hc = 0, mc = 0;
        const step = dur / n; tl2 = { total: dur, units: lv.map((x, i) => { const q = x / mx; const v = q < .12 ? 'sil' : q < .35 ? mid[mc++ % 4] : hi[hc++ % 4]; return { t: i * step, dur: step, v, ci: 0 }; }) };
      }
      this._src = src; let done = false;
      const end = () => { if (done) return; done = true; if (this._src === src) this._src = null; finish(); };
      src.onended = end; src.start(0);
      this.speech = { tl: tl2, t0: this.t + lead / src.playbackRate.value, onend: end, auto: true };
    } catch (e) { console.error(e); if (this.onTTSError) this.onTTSError(e); if (id === this._sid) { this.speech = { tl, t0: this.t, onend: finish, auto: true }; } }
  }
  /** Synthese für den nächsten Satz schon vorab starten */
  prefetch(text, rate = 1) { if (this.tts) this.tts.synth(text, (this.voicePitch || 1) / rate).catch(() => {}); }
  /** Langen Text satzweise vorlesen (robust gegen Längenlimits der Browserstimmen); onWord bekommt Zeichenpositionen im Gesamttext. */
  speakLong(text, { onend, ...opts } = {}) {
    const parts = []; const re = /[^.!?\n]+[.!?]*\s*/g; let m;
    while ((m = re.exec(text)) !== null) { if (m[0].trim()) parts.push({ t: m[0], off: m.index }); }
    let i = 0; const token = ++this._longId || (this._longId = 1);
    const next = () => {
      if (token !== this._longId) return;
      if (i >= parts.length) { this._wordOffset = 0; if (onend) onend(); return; }
      const p = parts[i++]; this._wordOffset = p.off;
      if (parts[i] && !opts.silent) this.prefetch(parts[i].t, opts.rate || 1);
      this.speak(p.t, { ...opts, onend: next });
    };
    next();
  }
  /** Eigene Viseme-Zeitleiste, z. B. aus TTS-Phonemen: [{t:0.00,v:'sil'},{t:0.12,v:'aa'},...] (Sekunden), Namen wie Oculus. */
  playVisemes(list, onend) {
    const units = list.map((x, i) => ({ t: x.t, v: x.v, dur: (list[i + 1] ? list[i + 1].t : x.t + .2) - x.t, ci: 0 }));
    const id = ++this._sid; this._longId = (this._longId || 0) + 1;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.speech = { tl: { units, total: units.length ? units[units.length - 1].t + units[units.length - 1].dur : 0 }, t0: this.t, auto: true,
      onend: () => { if (id !== this._sid) return; this.speech = null; this.setMouth(this.emo.mouth); if (onend) onend(); } };
  }
  stopSpeaking() {
    this._sid++; this._longId = (this._longId || 0) + 1; this._wordOffset = 0;
    if (this._utt) this._utt._dead = true;
    if (this._src) { try { this._src.onended = null; this._src.stop(); } catch (e) { /* egal */ } this._src = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.speech) { this.speech = null; this.setMouth(this.emo.mouth); }
  }
  /** Lautstärkegesteuert (ohne Phoneme): HTMLAudioElement oder MediaStream */
  attachAudio(src, ctx = new (window.AudioContext || window.webkitAudioContext)()) {
    const node = src instanceof MediaStream ? ctx.createMediaStreamSource(src) : ctx.createMediaElementSource(src);
    const an = ctx.createAnalyser(); an.fftSize = 512; node.connect(an); if (!(src instanceof MediaStream)) an.connect(ctx.destination);
    this.audioAn = { an, buf: new Uint8Array(an.fftSize), last: 0, hold: 0 };
  }
  detachAudio() { this.audioAn = null; this.setMouth(this.emo.mouth); }

  // ------------------------------------------------------------ Bones
  _addRot(name, ax, ay, az) {
    const b = this.bones[name]; if (!b || !b.userData.rest) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, ay, az));
    b.quaternion.copy(b.userData.rest).multiply(q);
  }
  /** Ohren: Weltachsen der Figur (Blickrichtung +Z, links = +X). alpha: nach innen (+) / außen (-), beta: nach vorn (+) / hinten (-) */
  _earPose(side, alpha, beta) {
    const sg = side === 'L' ? 1 : -1; const w = [.4, .35, .25];
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 3; i++) {
      const b = this.bones[`Ear_${side}_${i + 1}`]; if (!b || !b.userData.rest) continue;
      const d = new THREE.Quaternion().setFromAxisAngle(Z, sg * alpha * w[i]).multiply(new THREE.Quaternion().setFromAxisAngle(X, beta * w[i]));
      const Rw = this.earRw[side][i];
      const local = Rw.clone().invert().multiply(d).multiply(Rw);
      b.quaternion.copy(local).multiply(b.userData.rest);
    }
  }
  _ears(dt) {
    const T = this.t;
    for (const s of ['L', 'R']) {
      const k = 'next' + s;
      if (this.autoEars && T > this.earFlick[k]) { this.earFlick['t' + s] = T; this.earFlick[k] = T + 3 + Math.random() * 6; }
      let fl = 0; const t0 = this.earFlick['t' + s];
      if (t0 !== undefined && T - t0 >= 0 && T - t0 < .45) fl = Math.sin(((T - t0) / .45) * Math.PI);
      const pose = this.earCur[0];
      const alpha = (pose > 0 ? pose * .30 : pose * .55) + fl * .10 + Math.sin(T * .9 + (s === 'L' ? 0 : 1.7)) * .015;
      const beta = (pose > 0 ? pose * .12 : pose * .30) + fl * .45;
      this._earPose(s, alpha, beta);
    }
  }

  // ------------------------------------------------------------ Tick
  update(dt) {
    this.t += dt;
    if (this.mixer) this.mixer.update(dt);
    const T = this.t;
    // Ohren
    this.earCur[0] += (this.earTarget[0] - this.earCur[0]) * Math.min(1, dt * 6);
    this._ears(dt);
    // Idle (nur ohne Körperclip)
    if (!this.action && this.autoIdle) {
      const br = Math.sin(T * 1.7) * .012;
      this._addRot('mixamorigSpine1', br, 0, 0); this._addRot('mixamorigSpine2', br * .8, 0, 0);
    }
    // Kopfbewegung beim Sprechen
    const talking = !!this.speech || !!this.audioAn;
    this.talkAmt += ((talking ? 1 : 0) - this.talkAmt) * Math.min(1, dt * 5);
    if (this.autoIdle || this.talkAmt > .01) {
      const ph = T * 3.1;
      const H = this.headExtra;
      this._addRot('mixamorigHead', (Math.sin(ph) * .03 + Math.sin(T * .7) * .015) * (.4 + this.talkAmt) + H.pitch, Math.sin(T * 1.3) * .04 * (.4 + this.talkAmt) + H.yaw, Math.sin(T * .9) * .012 + H.roll);
    }
    // Blinzeln (pro Auge, nur bei offenen Augenzuständen)
    if (this.autoBlink) {
      const B = this.blink; const ok = (n) => ['open', 'surprised', 'sad', 'angry'].includes(n);
      if (B.phase < 0 && T > B.next) { B.phase = 0; B.t = T; }
      if (B.phase >= 0) {
        const seq = ['half', 'blink', 'closed', 'blink', 'half']; const k = Math.floor((T - B.t) / .045);
        if (k >= seq.length) { B.phase = -1; B.next = T + 2 + Math.random() * 3.5; if (Math.random() < .15) B.next = T + .25; this.eyeNow = { ...this.eyeBase }; }
        else { for (const sd of ['left', 'right']) this.eyeNow[sd] = ok(this.eyeBase[sd]) ? seq[k] : this.eyeBase[sd]; }
        this._renderEyes();
      }
    }
    // Blick-Drift
    if (!this.gazeUser && T > this.nextSaccade) {
      this.nextSaccade = T + .8 + Math.random() * 2.4;
      this.gazeTarget = Math.random() < .6 ? [0, 0] : [(Math.random() * 2 - 1) * .9, (Math.random() * 2 - 1) * .7];
      this.setGaze(this.gazeTarget[0], this.gazeTarget[1]);
    }
    if (this.script) { const S = this.script; const tt = T - S.t0;
      while (S.i < S.steps.length && tt >= S.steps[S.i][0]) { S.steps[S.i][1](tt); S.i++; }
      if (S.update) S.update(tt);
      if (tt >= S.end) { const f = S.done; this.script = null; this.headExtra = { pitch: 0, yaw: 0, roll: 0 }; if (f) f(); }
    }
    // Sprech-Zeitleiste
    if (this.speech) {
      const S = this.speech; const tt = T - S.t0; const us = S.tl.units;
      let cur = null; for (let i = us.length - 1; i >= 0; i--) { if (tt >= us[i].t) { cur = us[i]; break; } }
      if (S.auto && tt > S.tl.total + .1) { const f = S.onend; this.speech = null; if (f) f(); }
      else if (S.endAt !== undefined && T - S.endAt > .25) { const f = S.onend; this.speech = null; if (f) f(); }
      else if (cur && cur.v !== this.state.mouth) this.setMouth(cur.v);
    } else if (this.audioAn) {
      const A = this.audioAn; A.an.getByteTimeDomainData(A.buf);
      let s = 0; for (const v of A.buf) { const x = (v - 128) / 128; s += x * x; } const rms = Math.sqrt(s / A.buf.length);
      if (T > A.hold) {
        const m = rms < .02 ? 'sil' : rms < .06 ? 'nn' : rms < .11 ? 'O' : rms < .17 ? 'E' : 'aa';
        if (m !== A.last) { A.last = m; this.setMouth(m); A.hold = T + .05; }
      }
    }
  }
}

