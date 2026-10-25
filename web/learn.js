// Englisch-Trainer mit Fennek (Grundschule Klasse 3, Hessen): Wortschatz abfragen per Sprache oder Tippen.
// Der Fennek spricht das englische Wort erst, wenn die Antwort richtig ist.
export const TOPICS = {
  colours: { label: 'Colours – Farben', q: 'What colour is this?', words: [
    { en: 'red', de: 'rot', c: '#e53935', alt: ['read'] }, { en: 'blue', de: 'blau', c: '#1e6fe0' }, { en: 'green', de: 'grün', c: '#2e9e4a' },
    { en: 'yellow', de: 'gelb', c: '#fdd835' }, { en: 'orange', de: 'orange', c: '#fb8c00' }, { en: 'pink', de: 'rosa', c: '#f48fb1' },
    { en: 'purple', de: 'lila', c: '#8e44ad' }, { en: 'brown', de: 'braun', c: '#7b4a2a' }, { en: 'black', de: 'schwarz', c: '#111' },
    { en: 'white', de: 'weiß', c: '#f5f5f5' }, { en: 'grey', de: 'grau', c: '#9e9e9e', alt: ['gray'] }] },
  numbers: { label: 'Numbers – Zahlen', q: 'What number is this?', words: [
    ['one', 'eins', '1', ['won']], ['two', 'zwei', '2', ['to', 'too']], ['three', 'drei', '3'], ['four', 'vier', '4', ['for']], ['five', 'fünf', '5'], ['six', 'sechs', '6'],
    ['seven', 'sieben', '7'], ['eight', 'acht', '8', ['ate']], ['nine', 'neun', '9'], ['ten', 'zehn', '10'], ['eleven', 'elf', '11'], ['twelve', 'zwölf', '12']]
    .map(([en, de, v, alt]) => ({ en, de, big: v, alt: alt || [] })) },
  animals: { label: 'Animals – Tiere', q: 'What is this?', words: [
    ['cat', 'Katze', '🐱'], ['dog', 'Hund', '🐶'], ['bird', 'Vogel', '🐦'], ['fish', 'Fisch', '🐟'], ['mouse', 'Maus', '🐭'], ['rabbit', 'Hase', '🐰'], ['horse', 'Pferd', '🐴'],
    ['cow', 'Kuh', '🐮'], ['pig', 'Schwein', '🐷'], ['sheep', 'Schaf', '🐑'], ['elephant', 'Elefant', '🐘'], ['monkey', 'Affe', '🐵'], ['lion', 'Löwe', '🦁'], ['fox', 'Fuchs', '🦊']]
    .map(([en, de, v]) => ({ en, de, big: v })) },
  family: { label: 'Family – Familie', q: 'Who is this?', words: [
    ['mother', 'Mutter', '👩', ['mum', 'mom', 'mummy', 'mommy']], ['father', 'Vater', '👨', ['dad', 'daddy']], ['sister', 'Schwester', '👧'], ['brother', 'Bruder', '👦'],
    ['grandma', 'Oma', '👵', ['grandmother']], ['grandpa', 'Opa', '👴', ['grandfather']], ['baby', 'Baby', '👶']].map(([en, de, v, alt]) => ({ en, de, big: v, alt: alt || [] })) },
  body: { label: 'My body – Körper', q: 'What is this?', words: [
    ['nose', 'Nase', '👃'], ['eye', 'Auge', '👁️', ['i']], ['ear', 'Ohr', '👂'], ['mouth', 'Mund', '👄'], ['hand', 'Hand', '✋'], ['foot', 'Fuß', '🦶'], ['arm', 'Arm', '💪'], ['leg', 'Bein', '🦵']]
    .map(([en, de, v, alt]) => ({ en, de, big: v, alt: alt || [] })) },
  food: { label: 'Food – Essen & Trinken', q: 'What is this?', words: [
    ['apple', 'Apfel', '🍎'], ['banana', 'Banane', '🍌'], ['bread', 'Brot', '🍞'], ['milk', 'Milch', '🥛'], ['cheese', 'Käse', '🧀'], ['cake', 'Kuchen', '🍰'],
    ['egg', 'Ei', '🥚'], ['pizza', 'Pizza', '🍕'], ['water', 'Wasser', '💧'], ['ice cream', 'Eis', '🍦']].map(([en, de, v]) => ({ en, de, big: v })) },
  school: { label: 'School – Schule', q: 'What is this?', words: [
    ['book', 'Buch', '📖'], ['pencil', 'Bleistift', '✏️'], ['bag', 'Schulranzen', '🎒'], ['scissors', 'Schere', '✂️'], ['clock', 'Uhr', '🕒'], ['school', 'Schule', '🏫'], ['computer', 'Computer', '💻']]
    .map(([en, de, v]) => ({ en, de, big: v })) },
  weather: { label: 'Weather – Wetter', q: 'What is the weather like?', words: [
    ['sun', 'Sonne', '☀️', ['sunny']], ['rain', 'Regen', '🌧️', ['rainy']], ['snow', 'Schnee', '❄️', ['snowy']], ['wind', 'Wind', '💨', ['windy']], ['cloud', 'Wolke', '☁️', ['cloudy']]]
    .map(([en, de, v, alt]) => ({ en, de, big: v, alt: alt || [] })) },
};

const NUM = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve' };
const norm = (s) => (s || '').toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(w => NUM[w] || w).join(' ').replace(/^(a|an|the) /, '');
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class EnglishTrainer {
  /** ui: {vis, q, hint, fb, input, stat, micBtn, ...} Elemente; listener: Listener (en-US) */
  constructor(avatar, ui) { this.A = avatar; this.ui = ui; this.stars = 0; this.round = []; this.cur = null; this.tries = 0; this.mode = 'mix'; this.busyMs = 0; this.active = false; this.total = 0; this.token = 0; }

  start(topicKey, mode, n = 10) {
    this.mode = mode; this.token++;
    const topics = topicKey === 'all' ? Object.keys(TOPICS) : [topicKey];
    const pool = topics.flatMap(k => TOPICS[k].words.map(w => ({ ...w, topic: k })));
    this.round = shuffle(pool).slice(0, n); this.total = this.round.length; this.stars = 0; this.active = true; this.done = 0;
    this.A.stopSpeaking(); this.next();
  }
  stop() { this.active = false; this.token++; this.A.stopSpeaking(); this.ui.show(null); }

  next() {
    if (!this.active) return;
    if (!this.round.length) return this._finish();
    this.cur = this.round.shift(); this.tries = 0; const w = this.cur;
    this.kind = this.mode === 'listen' ? 'listen' : this.mode === 'speak' ? 'speak' : this.mode === 'type' ? 'type' : rnd(['speak', 'type']);
    const T = TOPICS[w.topic];
    this.ui.show({ word: w, kind: this.kind, question: this.kind === 'listen' ? 'Listen and write the word!' : T.q, progress: `${this.done + 1} / ${this.total}`, stars: this.stars });
    this.A.setEmotion('neutral'); this.A.react('think');
    this._say(this.kind === 'listen' ? w.en : T.q);
  }
  repeat() { if (this.cur) this._say(this.kind === 'listen' ? this.cur.en : TOPICS[this.cur.topic].q); }
  _say(t, onend) { this.A.speak(t, { lang: 'en-US', rate: .9, onend }); }

  /** Antwort prüfen; spoken=true bei Spracherkennung (großzügiger) */
  answer(text, spoken) {
    if (!this.active || !this.cur) return;
    const w = this.cur, goal = [w.en, ...(w.alt || [])].map(norm), heard = norm(text); if (!heard) return;
    let ok = goal.includes(heard);
    if (!ok && spoken) {
      const toks = heard.split(' '), joined = heard;
      ok = goal.some(g => toks.includes(g) || joined.includes(g) || (g.length >= 4 && toks.some(t => lev(t, g) <= 1)));
    }
    this.ui.heard(spoken ? `Ich habe gehört: „${text}“` : '');
    if (ok) return this._right();
    this.tries++; this._wrong();
  }
  _right() {
    const w = this.cur, tok = this.token; this.done++; this.stars += this.tries === 0 ? 1 : 0;
    this.ui.correct(w, this.stars);
    this.A.setEmotion('joy'); this.A.react('nod');
    // erst jetzt spricht der Fennek das Wort
    this.A.speak(w.en + '!', { lang: 'en-US', rate: .85, onend: () => {
      if (tok !== this.token) return;
      this.A.speak(rnd(['Great!', 'Well done!', 'Super!', 'Perfect!', 'Yes, that is right!']), { lang: 'en-US', rate: .9, onend: () => setTimeout(() => tok === this.token && this.next(), 300) }); } });
  }
  _wrong() {
    const w = this.cur;
    this.A.setEmotion('worried'); this.A.stopSpeaking();
    this.A.react(rnd(['eyeroll', 'shake', 'oops', 'think']));
    if (this.tries >= 4) {                      // aufgeben: zeigen und vorsprechen, Wort kommt später nochmal
      this.round.splice(Math.min(2, this.round.length), 0, { ...w }); this.done = Math.max(0, this.done);
      const tok = this.token; this.ui.reveal(w);
      this.A.speak(w.en, { lang: 'en-US', rate: .8, onend: () => setTimeout(() => tok === this.token && this.next(), 800) });
      this.cur = null; return;
    }
    this.ui.wrong(this.tries, w.en);
  }
  skip() { if (!this.cur) return; this.tries = 4; this._wrong(); }
  _finish() {
    this.active = false; this.ui.finish(this.stars, this.total);
    this.A.setEmotion('joy'); this.A.react('giggle');
    this.A.speak(this.stars >= this.total * .7 ? 'Wow, great job!' : 'Well done! Let us practise again!', { lang: 'en-US', rate: .9 });
  }
}
