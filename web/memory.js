// Finns Gedächtnis: Steckbrief, gemerkte Sätze, Gesprächsverlauf – alles lokal im Browser (IndexedDB), nichts verlässt das Gerät.
// Liefert außerdem die Texte fürs Kennenlernen, persönliche Begrüßung und aktive Nachfragen.

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SESSION_GAP = 30 * MIN;           // längere Pause = neues Gespräch
const MAX_FACTS = 80, MAX_SESSIONS = 40, MAX_TURNS = 40;
const L = '[a-zäöüß]';                   // Buchstabe (für Wortgrenzen mit Umlauten)
const B1 = `(?<!${L})`, B2 = `(?!${L})`;

// ---------------------------------------------------------------- Steckbrief
export const SLOTS = {
  name:     { label: 'Name',            q: '[happy] Hallo! Ich bin Finn, ein Fennek aus der Wüste. Wie heißt du?' },
  alter:    { label: 'Alter',           q: '[happy] Wie alt bist du, {name}?' },
  klasse:   { label: 'Klasse',          q: '[thinking] Und in welche Klasse gehst du?' },
  tier:     { label: 'Lieblingstier',   q: '[surprised] Was ist dein Lieblingstier?' },
  hobby:    { label: 'Hobby',           q: '[happy] Was machst du in deiner Freizeit am liebsten?' },
  haustier: { label: 'Haustier',        q: '[thinking] Sag mal, {name}, hast du eigentlich ein Haustier?' },
  essen:    { label: 'Lieblingsessen',  q: '[happy] Was isst du am allerliebsten?' },
  farbe:    { label: 'Lieblingsfarbe',  q: '[happy] Was ist eigentlich deine Lieblingsfarbe?' },
  freund:   { label: 'Freund/in',       q: '[happy] Wie heißt denn dein bester Freund oder deine beste Freundin?' },
};
const ONBOARD = ['name', 'alter', 'klasse', 'tier', 'hobby'];
const LATER = ['haustier', 'essen', 'farbe', 'freund'];

const NUMW = { ein: 1, eins: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, 'zwölf': 12, dreizehn: 13, vierzehn: 14,
  erste: 1, ersten: 1, zweite: 2, zweiten: 2, dritte: 3, dritten: 3, vierte: 4, vierten: 4, 'fünfte': 5, 'fünften': 5, sechste: 6, sechsten: 6 };
const REFUSE = new RegExp(`(weiß (ich )?(nicht|nich)|keine ahnung|sag ich (dir )?nicht|verrat(e)? ich (dir )?nicht|geheim|egal|überspringen|weiter|keine lust)${B2}`, 'i');
const NOT_NAME = new Set(['ja', 'nein', 'nee', 'also', 'äh', 'ähm', 'hm', 'ich', 'und', 'hallo', 'hi', 'hey', 'der', 'die', 'das', 'heiße', 'heisse', 'bin', 'ist', 'mein', 'name', 'finn', 'du', 'okay', 'ok', 'weiß', 'nicht', 'keine', 'ahnung']);

const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
const words = (t) => t.replace(/[.,!?;:"„“]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
const strip = (t, res) => { let s = ' ' + t.replace(/[.,!?;:"„“]/g, ' ').replace(/\s+/g, ' ').trim() + ' ', o; do { o = s; for (const r of res) s = s.replace(r, ' '); } while (s !== o); return s.trim(); };
const num = (t) => { for (const w of words(t.toLowerCase())) { if (/^\d+\.?$/.test(w)) return parseInt(w); if (NUMW[w] != null) return NUMW[w]; } return null; };
const firstName = (t) => {
  const s = strip(t, [/\s(ich )?hei(ß|ss)(e)?( ich)?\s/i, /\smein name ist\s/i, /\sich bin( die| der)?\s/i, /\sbin ich\s/i, /\sdas ist\s/i, /\s(er|sie) hei(ß|ss)t\s/i, /\s(mein|meine) (beste(r)? )?(freund|freundin)( hei(ß|ss)t)?\s/i]);
  const w = words(s).find(x => !NOT_NAME.has(x.toLowerCase()) && /^[a-zäöüß-]{2,20}$/i.test(x));
  return w ? cap(w.toLowerCase()).replace(/-(\w)/, (m, c) => '-' + c.toUpperCase()) : null;
};
const ARTICLES = /\s(der|die|das|den|ein|eine|einen|einem|ein paar)\s/i;
const thing = (t, extra = []) => {
  const s = strip(t, [...extra, /\smein(e)? lieblings\w+ (ist|sind|wäre|wären)\s/i, /\sam (aller)?liebsten( (mag|esse|habe) ich)?\s/i, /\sich (mag|esse|liebe|finde|habe)( am (aller)?liebsten| gern(e)?| total gern(e)?)?\s/i,
    /\s(gern(e)?|toll|super|am meisten|ganz|sehr|natürlich|das ist|ist|sind|also|äh|ähm)\s/i, ARTICLES]);
  const w = words(s).slice(0, 3); return w.length ? w.join(' ') : null;
};
const infinitive = (v) => /e$/.test(v) ? v + 'n' : v + 'en';

const PARSE = {
  name: firstName,
  freund: firstName,
  alter: (t) => { const n = num(t); return n >= 4 && n <= 14 ? n : null; },
  klasse: (t) => { if (/vorschul|kindergarten/i.test(t)) return 'Vorschule'; const n = num(t.replace(/(\d)\./, '$1 ')); return n >= 1 && n <= 6 ? n : null; },
  tier: (t) => { const v = thing(t); return v && cap(v); },
  essen: (t) => { const v = thing(t); return v && cap(v); },
  farbe: (t) => thing(t),
  hobby: (t) => {
    const w = words(strip(t, [/\sich\s/i, /\sam (aller)?liebsten\s/i, /\sgern(e)?\s/i, /\sin meiner freizeit\s/i, /\smache ich\s/i, /\smein hobby ist\s/i, /\sdas ist\s/i]).toLowerCase());
    if (!w.length) return null;
    const v = w[0];   // "spiele Fußball" -> "Fußball spielen", "male" -> "malen"
    if (/^(spiele|male|lese|tanze|reite|turne|schwimme|singe|bastle|baue|fahre|klettere|koche|backe|zeichne|laufe|springe|schaue|gucke|höre|spiel|mal|les|fahr)$/.test(v))
      return (w.slice(1).map(x => /^(fußball|basketball|handball|tennis|lego|fahrrad|roller|klavier|gitarre|flöte|geige|bücher|computer|minecraft|playmobil|puppen|karten|verstecken|fangen)$/.test(x) ? cap(x) : x).join(' ') + ' ' + infinitive(v.replace(/e$/, ''))).trim();
    return w.slice(0, 4).map((x, i) => i === 0 ? cap(x) : x).join(' ');
  },
  haustier: (t) => {
    if (new RegExp(`^(nein|nee|nö|leider (nicht|nein)|kein|keine|nicht)${B2}`, 'i').test(t.trim())) return 'keins';
    const nm = t.match(/hei(?:ß|ss)t\s+(\S+)/i);
    const v = thing(t.replace(/,?\s*(der|die|das|er|sie|es)\s+hei(ß|ss)t.*$/i, '').replace(/hei(ß|ss)t.*$/i, ''), [/\s(ja|wir haben|ich habe|ich hab|zwei|drei)\s/i]);
    if (!v) return null;
    return cap(v) + (nm ? ' (' + cap(nm[1].replace(/[.,!?]/g, '').toLowerCase()) + ')' : '');
  },
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ACK = {
  name: (v) => `[joy] ${v}! Was für ein schöner Name. Freut mich, dich kennenzulernen!`,
  alter: (v) => `[surprised] ${v} Jahre, schon richtig groß!`,
  klasse: (v) => v === 'Vorschule' ? '[happy] Vorschule, toll! Bald kommst du in die Schule.' : `[happy] Die ${v}. Klasse, super! Da lernt man viele spannende Sachen.`,
  tier: (v) => `[happy] ${v}, toll! Gleich nach Fenneks finde ich die auch super.`,
  hobby: (v) => `[joy] ${cap(v)}, das klingt nach Spaß!`,
  haustier: (v) => v === 'keins' ? '[thinking] Kein Haustier? Dann bin ich ab jetzt dein Fennek!' : `[happy] Oh, wie schön! Grüß ${(v.match(/\((.+)\)/) || [])[1] || 'dein Haustier'} von mir.`,
  essen: (v) => `[joy] Mmh, ${v}! Ich esse am liebsten knusprige Käfer. Igitt, sagst du?`,
  farbe: (v) => `[happy] ${cap(v)}, schön! Meine Lieblingsfarbe ist Sandgelb, wie die Wüste.`,
  freund: (v) => `[happy] ${v}, ein schöner Name! Grüß ${v} mal von mir.`,
};

// ---------------------------------------------------------------- Termine erkennen ("Am Samstag habe ich ein Turnier")
const WD = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const TIME_RE = new RegExp(`${B1}(heute(?: (?:nachmittag|abend|mittag))?|übermorgen|morgen(?: (?:früh|nachmittag|abend))?|(?:am|nächsten|diesen) (?:${WD.join('|')})|am wochenende|nächste woche|in den ferien)${B2}`, 'i');
const PAST_RE = new RegExp(`${B1}(gestern|vorgestern|letzte woche|letzten \\w+|vorhin|war|waren|hatte|hatten)${B2}`, 'i');
const ICH = { habe: 'hast', hab: 'hast', bin: 'bist', gehe: 'gehst', geh: 'gehst', fahre: 'fährst', fahr: 'fährst', darf: 'darfst', muss: 'musst', will: 'willst', kann: 'kannst',
  werde: 'wirst', treffe: 'triffst', lese: 'liest', sehe: 'siehst', schlafe: 'schläfst', laufe: 'läufst', esse: 'isst', krieg: 'kriegst', soll: 'sollst', mag: 'magst' };
const WIR = { sind: 'seid' };
const NOT_VERB = new Set(['meine', 'deine', 'eine', 'keine', 'seine', 'ihre', 'gerne', 'heute', 'hatte', 'wollte', 'musste', 'durfte', 'konnte', 'sollte', 'den', 'einen', 'meinen', 'deinen', 'unseren', 'in', 'dann', 'wann', 'denn', 'wenn', 'schon', 'auch', 'noch', 'mama', 'papa', 'oma', 'opa', 'ganz', 'endlich', 'vielleicht', 'oben', 'unten', 'zusammen']);
const isVerb = (w, we) => { w = w.toLowerCase(); if (NOT_VERB.has(w)) return false; return we ? (w === 'sind' || /n$/.test(w)) && w.length >= 4 : ICH[w] || (/e$/.test(w) && w.length >= 4); };
const conj = (w, we) => { w = w.toLowerCase();
  if (we) return WIR[w] || ((s) => s + (/[td]$/.test(s) ? 'et' : 't'))(w.replace(/e?n$/, ''));
  if (ICH[w]) return ICH[w]; const s = w.replace(/e$/, ''); return s + (/[td]$/.test(s) ? 'est' : /[sßzx]$/.test(s) ? 't' : 'st'); };
const DU = { mein: 'dein', meine: 'deine', meinen: 'deinen', meinem: 'deinem', meiner: 'deiner', meines: 'deines', mir: 'dir', mich: 'dich',
  unser: 'euer', unsere: 'eure', unseren: 'euren', unserem: 'eurem', unserer: 'eurer', uns: 'euch' };
const toDu = (w) => DU[w.toLowerCase()] || w;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function eventDay(time, now) {
  const today = new Date(now).getDay(); let d = 0;
  if (/^übermorgen/.test(time)) d = 2; else if (/^morgen/.test(time)) d = 1; else if (/^heute/.test(time)) d = 0;
  else if (/wochenende/.test(time)) d = today === 0 ? 0 : 6 - today;
  else if (/nächste woche/.test(time)) d = 7; else if (/ferien/.test(time)) d = 14;
  else { const i = WD.indexOf(time.split(' ')[1]); d = (i - today + 7) % 7; if (d === 0 && /^nächsten/.test(time)) d = 7; }
  return dayStart(now) + d * DAY;
}
/** Satz mit Zeitangabe -> Termin {clause: "dass du am Samstag ein Turnier hast", due} oder null */
export function parseEvent(sentence, now = Date.now()) {
  const tm = sentence.match(TIME_RE); if (!tm || PAST_RE.test(sentence)) return null;
  const time = tm[1].toLowerCase();
  const w = words(sentence.slice(0, tm.index) + ' ' + sentence.slice(tm.index + tm[0].length));
  while (w.length && /^(und|also|weißt|du|finn|hey|ja|oh|übrigens)$/i.test(w[0])) w.shift();
  let subj = '', verb, rest;
  const i = w.findIndex(x => /^(ich|wir)$/i.test(x));
  if (i >= 0) {
    const we = w[i].toLowerCase() === 'wir';
    const vi = i + 1 < w.length && isVerb(w[i + 1], we) ? i + 1 : i > 0 && isVerb(w[i - 1], we) ? i - 1 : -1;
    if (vi < 0) return null;
    verb = conj(w[vi], we); subj = we ? 'ihr' : 'du'; rest = w.filter((_, k) => k !== i && k !== vi);
  } else if (tm.index < 3 && w.length > 1 && /^(kommt|kommen|ist|sind|hat|haben|fährt|geht|gibt)$/i.test(w[0])) {
    verb = w[0].toLowerCase(); rest = w.slice(1);              // "Morgen kommt meine Oma"
  } else return null;
  rest = rest.map(toDu);
  if (!rest.length) return null;
  if (/^ge\w{2,}(t|en)$/i.test(rest[rest.length - 1]) && /^(hast|bist|habt|seid|hat|ist|haben|sind)$/.test(verb)) return null;   // Perfekt = schon passiert
  const keep = /^(am|nächsten|diesen) /.test(time) ? 'am ' + cap(time.split(' ')[1]) : /wochenende|ferien/.test(time) ? time : '';
  return { clause: ['dass', subj, keep, ...rest, verb].filter(Boolean).join(' '), due: eventDay(time, now) + 17 * HOUR };
}

// Dinge, die man sich merken sollte (ganzer Satz wird gespeichert)
const FACT_RES = [
  /\bmein(e|en)? (beste[rn]? )?(hund|katze|kater|hase|kaninchen|meerschweinchen|hamster|pferd|pony|wellensittich|fisch|schildkröte|bruder|schwester|freund|freundin|oma|opa|lehrer|lehrerin|cousin|cousine|tante|onkel)\b.*\bhei(ß|ss)t\b/i,
  /\bich hab(e)? (einen|eine|ein|zwei|drei|vier|\d) (hund|katze|kater|hasen|kaninchen|meerschweinchen|hamster|pferd|pony|wellensittich|fische?|schildkröte|bruder|schwester|brüder|schwestern|geschwister)/i,
  /\bich (mag|liebe)\b(?! dich)/i, /\bich mag kein/i, /\bmein lieblings\w+ (ist|sind)\b/i,
  /\bich (spiele|tanze|reite|turne|schwimme|male|lese|singe|bastle|klettere) (total |sehr )?gern/i,
  /\bich kann (jetzt|schon|endlich)\b/i, /\bich hab(e)? angst (vor|im)\b/i, /\bich bin (gut|schlecht) in\b/i, /\bich (will|möchte) (später|mal) \w+ werden/i,
];
const SENSITIVE = /stra(ß|ss)e|\bstr\.|hausnummer|telefon|handy|nummer|adresse|passwort|wohne in|wohnen in|nachname|@|\d{3,}/i;

const fmtDay = (t, now = Date.now()) => { const d = Math.round((dayStart(now) - dayStart(t)) / DAY);
  return d <= 0 ? 'heute' : d === 1 ? 'gestern' : d < 7 ? `vor ${d} Tagen` : new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }); };
const join = (...parts) => parts.filter(Boolean).map((p, i) => i ? p.replace(/^\s*\[\w+\]\s*/, '') : p).join(' ');

const FUN = [
  '[thinking] Sag mal, {name}, was war heute das Schönste an deinem Tag?',
  '[surprised] Weißt du, warum ich so riesige Ohren habe? Rate mal!',
  '[happy] Wollen wir ein paar englische Wörter üben?',
  '[thinking] Wenn du ein Tier sein könntest, welches wärst du?',
  '[happy] Erzähl mal, {name}, was hast du heute gespielt?',
  '[thinking] Was möchtest du später mal werden?',
];

// ---------------------------------------------------------------- Speicher
class Store {
  constructor(name) { this.name = name; this.db = null; }
  async open() {
    if (typeof indexedDB === 'undefined') return;
    try { this.db = await new Promise((res, rej) => { const r = indexedDB.open(this.name, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
    catch (e) { this.db = null; }
  }
  _tx(mode, fn) { return new Promise((res, rej) => { const t = this.db.transaction('kv', mode); const r = fn(t.objectStore('kv')); t.oncomplete = () => res(r.result); t.onerror = () => rej(t.error); }); }
  async get(k) { if (this.db) return this._tx('readonly', s => s.get(k)); try { return JSON.parse(localStorage.getItem(this.name + ':' + k)); } catch (e) { return null; } }
  async set(k, v) { if (this.db) return this._tx('readwrite', s => s.put(v, k)); try { localStorage.setItem(this.name + ':' + k, JSON.stringify(v)); } catch (e) { /* nur im Speicher */ } }
}

export class FinnMemory {
  constructor({ dbName = 'finn-memory' } = {}) {
    this.store = new Store(dbName); this.onChange = () => {};
    this.data = { profile: {}, facts: [], sessions: [], meta: { asked: {} } };
    this.pendingSlot = null; this.onboarding = false; this.greeted = false; this.usedNudges = new Set(); this.askedNow = new Set();
  }
  async load(now = Date.now()) {
    await this.store.open();
    const d = await this.store.get('all').catch(() => null);
    if (d && d.profile) this.data = Object.assign({ profile: {}, facts: [], sessions: [], meta: {} }, d);
    this.data.meta.asked ||= {};
    const last = this.data.sessions[this.data.sessions.length - 1];
    this.lastSeen = last ? last.end : 0;
    if (last && now - last.end < SESSION_GAP) { this.cur = last; this.greeted = !!last.greeted; }
    else this._newSession(now);
    return this;
  }
  _newSession(now) { this.cur = { id: now, start: now, end: now, turns: [] }; this.data.sessions.push(this.cur); this.data.sessions = this.data.sessions.slice(-MAX_SESSIONS); }
  save() { this.onChange(); clearTimeout(this._st); this._st = setTimeout(() => this.store.set('all', this.data).catch(e => console.warn('Gedächtnis nicht gespeichert', e)), 150); }
  async flush() { clearTimeout(this._st); await this.store.set('all', this.data); }

  get profile() { return this.data.profile; }
  get name() { return this.data.profile.name || ''; }
  get facts() { return this.data.facts; }
  get sessions() { return this.data.sessions; }
  setProfile(k, v) { if (v === '' || v == null) delete this.data.profile[k]; else this.data.profile[k] = v; this.save(); }
  fill(t) { const n = this.name; return t.replace(/(,\s*)?\{name\}/g, (m, c) => n ? (c || '') + n : '').replace(/\{(\w+)\}/g, (m, k) => this.profile[k] || ''); }

  addTurn(who, text, now = Date.now()) {
    if (!text) return;
    if (now - this.cur.end > SESSION_GAP) { this._newSession(now); this.greeted = false; this.usedNudges.clear(); this.askedNow.clear(); }
    this.cur.turns.push({ who, text, t: now }); this.cur.turns = this.cur.turns.slice(-MAX_TURNS); this.cur.end = now; this.save();
  }
  recentTurns(n = 8) { return this.cur.turns.slice(-n); }

  /** Kindersatz auswerten: Steckbrief ergänzen, Merkenswertes und Termine speichern. Gibt neue Einträge zurück. */
  observe(text, now = Date.now()) {
    const found = [], t = (text || '').trim().split(/(?<=[.!?])\s+/).filter(x => !SENSITIVE.test(x)).join(' '); if (!t) return found;
    let m;
    if ((m = t.match(/\b(?:ich hei(?:ß|ss)e|mein name ist)\s+([a-zäöüß-]{2,20})/i)) && !NOT_NAME.has(m[1].toLowerCase())) this.setProfile('name', cap(m[1].toLowerCase()));
    if ((m = t.match(/\bich bin (\w+) jahre/i)) && PARSE.alter(m[1])) this.setProfile('alter', PARSE.alter(m[1]));
    if ((m = t.match(/\bich (?:gehe |bin )?in (?:die |der )?(\S+) klasse/i)) && PARSE.klasse(m[1])) this.setProfile('klasse', PARSE.klasse(m[1]));
    if ((m = t.match(/\bmein lieblings(tier|essen|farbe) (?:ist|sind) ([^.!?,]+)/i))) { const k = { tier: 'tier', essen: 'essen', farbe: 'farbe' }[m[1].toLowerCase()]; const v = PARSE[k](m[2]); if (v) this.setProfile(k, v); }
    const PET = '(hund|katze|kater|hase|kaninchen|meerschweinchen|hamster|pferd|pony|wellensittich|schildkröte)';
    if (!this.profile.haustier && (m = t.match(new RegExp(`\\bmein(?:e|en)? ${PET}\\b.*?\\bhei(?:ß|ss)t\\s+([a-zäöüß-]{2,20})`, 'i')) || t.match(new RegExp(`\\bich hab(?:e)? (?:einen|eine|ein) ${PET}\\b`, 'i'))))
      this.setProfile('haustier', cap(m[1].toLowerCase()) + (m[2] ? ' (' + cap(m[2].toLowerCase()) + ')' : ''));
    for (const s of t.split(/(?<=[.!?])\s+/)) {
      if (s.length > 160 || SENSITIVE.test(s)) continue;
      const ev = parseEvent(s, now);
      if (ev) found.push(this._addFact({ kind: 'event', text: s.trim(), ...ev }, now));
      else if (FACT_RES.some(r => r.test(s))) found.push(this._addFact({ kind: 'fact', text: s.trim() }, now));
    }
    return found.filter(Boolean);
  }
  _addFact(f, now = Date.now()) {
    if (this.facts.some(x => x.text.toLowerCase() === f.text.toLowerCase())) return null;
    const x = { id: now + '-' + Math.random().toString(36).slice(2, 6), ts: now, ...f };
    this.facts.push(x); this.data.facts = this.facts.slice(-MAX_FACTS); this.save(); return x;
  }
  note(text, kind = 'learn', now = Date.now()) { return this._addFact({ kind, text }, now); }
  removeFact(id) { this.data.facts = this.facts.filter(f => f.id !== id); this.save(); }
  async forget() { this.data = { profile: {}, facts: [], sessions: [], meta: { asked: {} } }; this._newSession(Date.now()); this.pendingSlot = null; this.onboarding = false; this.greeted = false; await this.flush(); this.onChange(); }

  // ---------------------------------------------------------------- Kennenlernen / Fragen
  ask(slot) { this.pendingSlot = slot; this.askedNow.add(slot); this.data.meta.asked[slot] = (this.data.meta.asked[slot] || 0) + 1; this.save(); return this.fill(SLOTS[slot].q); }
  startOnboarding() { this.onboarding = true; this._onb = new Set(); this._retry = false; return this.ask(this._nextOnb()); }
  _nextOnb() { return ONBOARD.find(s => !this.profile[s] && !this._onb.has(s)); }
  /** Antwort auf eine offene Steckbrief-Frage. null = keine Frage offen bzw. Antwort passt nicht (normal weiterreden). */
  answer(text) {
    const slot = this.pendingSlot; if (!slot) return null;
    this.pendingSlot = null; const t = (text || '').trim(); let reply;
    if (REFUSE.test(t)) reply = '[happy] Okay, kein Problem!';
    else {
      const v = PARSE[slot](t);
      if (v != null) { this.setProfile(slot, v); reply = ACK[slot](v); }
      else if (slot === 'name' && !this._retry) { this._retry = true; this.pendingSlot = 'name'; return '[thinking] Hmm, das habe ich nicht ganz verstanden. Sag mir einfach deinen Vornamen!'; }
      else if (!this.onboarding && words(t).length > 4) return null;
      else reply = '[thinking] Hmm, das habe ich nicht ganz verstanden. Macht nichts!';
    }
    if (this.onboarding) {
      this._onb.add(slot); const next = this._nextOnb();
      if (next) reply = join(reply, this.ask(next));
      else { this.onboarding = false; this.data.meta.onboarded = Date.now(); this.save(); reply = join(reply, this.fill('[happy] Jetzt kenne ich dich schon ein bisschen, {name}! Wir können quatschen oder Englisch üben.')); }
    }
    return this.fill(reply);
  }
  _slotQuestion() {
    const s = [...ONBOARD, ...LATER].find(k => !this.profile[k] && !this.askedNow.has(k) && (this.data.meta.asked[k] || 0) < 2);
    return s ? this.ask(s) : null;
  }
  _followUp(now) {
    const ev = this.facts.find(f => f.kind === 'event' && !f.asked && f.due <= now && now - f.due < 10 * DAY);
    if (!ev) return null;
    ev.asked = now; this.save();
    return `[thinking] Du hast mir doch erzählt, ${ev.clause}. ${pick(['Wie war es?', 'Wie ist es gelaufen?', "Erzähl mal, wie war's?"])}`;
  }
  _schoolQuestion(now) {
    const d = new Date(now), day = d.toDateString();
    if (d.getDay() === 0 || d.getDay() === 6 || d.getHours() < 12 || this.data.meta.schoolAsked === day) return null;
    this.data.meta.schoolAsked = day; this.save(); return '[happy] Wie war es heute in der Schule?';
  }
  /** Persönliche Begrüßung (startet beim ersten Mal das Kennenlernen). */
  greeting(now = Date.now()) {
    if (!this.name) return this.startOnboarding();
    const n = this.name, h = new Date(now).getHours(), gap = now - (this.lastSeen || now);
    const hi = this.greeted ? `[happy] Da bist du ja wieder, ${n}!`
      : this.lastSeen && gap > 3 * DAY ? `[joy] ${n}! Schön, dass du wieder da bist. Ich hab dich vermisst!`
      : `[happy] ${h < 11 ? 'Guten Morgen' : h >= 18 ? 'Guten Abend' : 'Hallo'}, ${n}!`;
    this.greeted = this.cur.greeted = true; this.save();
    const q = this._followUp(now) || this._schoolQuestion(now) || this._slotQuestion() || '[happy] Was wollen wir machen? Quatschen oder Englisch üben?';
    return join(hi, q.split(', ' + n + ',').join(',').split(', ' + n + '?').join('?'));   // Namen nicht zweimal
  }
  /** Aktive Nachfrage in einer Gesprächspause. */
  nudge(now = Date.now()) {
    const f = this._followUp(now) || (Math.random() < .5 && this._slotQuestion());
    if (f) return f;
    const pool = FUN.filter(x => !this.usedNudges.has(x)); if (!pool.length) return null;
    if (this.profile.tier && !this.usedNudges.has('tier')) { this.usedNudges.add('tier'); return this.fill('[happy] Sag mal, {name}, ist {tier} immer noch dein Lieblingstier?'); }
    const x = pick(pool); this.usedNudges.add(x); return this.fill(x);
  }
  /** "Was weißt du über mich?" */
  aboutYou() {
    const p = this.profile; if (!p.name) return null;
    const bits = [p.alter && `du bist ${p.alter} Jahre alt`, p.klasse && (p.klasse === 'Vorschule' ? 'du gehst in die Vorschule' : `du gehst in die ${p.klasse}. Klasse`),
      p.tier && `dein Lieblingstier ist ${p.tier}`, p.hobby && `du magst ${p.hobby}`].filter(Boolean);
    return `[joy] Du bist ${p.name}! ` + (bits.length ? cap(bits.join(', ')) + '.' : 'Erzähl mir mehr von dir!');
  }

  // ---------------------------------------------------------------- Kontext fürs Sprachmodell
  context(now = Date.now()) {
    const p = this.profile, out = [];
    const who = [p.name && `heißt ${p.name}`, p.alter && `ist ${p.alter} Jahre alt`, p.klasse && (p.klasse === 'Vorschule' ? 'geht in die Vorschule' : `geht in die ${p.klasse}. Klasse`)].filter(Boolean);
    if (who.length) out.push('Das Kind ' + who.join(', ') + '.');
    const favs = Object.keys(SLOTS).filter(k => !['name', 'alter', 'klasse'].includes(k) && p[k]).map(k => `${SLOTS[k].label}: ${p[k]}`);
    if (favs.length) out.push(favs.join('; ') + '.');
    const facts = this.facts.slice(-6).map(f => `- ${fmtDay(f.ts, now)}: „${f.text}“`);
    if (facts.length) out.push('Das hat das Kind dir erzählt:\n' + facts.join('\n'));
    const sums = this.sessions.filter(s => s.summary && s !== this.cur).slice(-3).map(s => `- ${fmtDay(s.start, now)}: ${s.summary}`);
    if (sums.length) out.push('Frühere Gespräche:\n' + sums.join('\n'));
    if (!out.length) return '';
    return 'Was du über das Kind weißt (sprich es ab und zu mit Namen an und knüpfe daran an, aber erfinde nichts dazu):\n' + out.join('\n');
  }
  /** Frühere Gespräche ohne Zusammenfassung (werden mit dem Sprachmodell nachgeholt). */
  pendingSummaries() { return this.sessions.filter(s => s !== this.cur && !s.summary && !s.noSummary && s.turns.filter(t => t.who === 'du').length >= 2); }
  setSummary(s, text) { if (text) s.summary = text; else s.noSummary = true; this.save(); }
}
