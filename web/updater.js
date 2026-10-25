// Updater: vergleicht manifest.json (Dateiliste mit Hashes) mit dem lokal installierten Stand und lädt NUR geänderte Dateien nach.
// "data"-Dateien (Modell, Bibliotheken, WASM, ...) ändern sich selten und bleiben bei App-Updates unangetastet, solange ihr Hash gleich ist.
const STATE_KEY = 'finn-installed';
const staged = () => caches.open('finn-staging');
const target = (cls) => caches.open(cls === 'data' ? 'finn-data' : 'finn-code');
const abs = (p) => new URL(p, location.href).href;

export class Updater {
  get supported() { return 'caches' in window && 'serviceWorker' in navigator && location.protocol.startsWith('http'); }
  get state() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (e) { return {}; } }
  _save(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* egal */ } }
  get version() { return this.state.version || null; }

  async register() { if (this.supported) try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW', e); } }

  /** Holt manifest.json (nie aus dem Cache) und liefert { manifest, changed[], removed[], bytes } – oder null ohne Manifest/Netz (z. B. Entwicklung). */
  async check() {
    if (!this.supported) return null;
    let m; try { const r = await fetch(abs('manifest.json') + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null; m = await r.json(); } catch (e) { return null; }
    const have = this.state.files || {};
    const changed = m.files.filter(f => have[f.path] !== f.hash);
    const removed = Object.keys(have).filter(p => !m.files.some(f => f.path === p));
    return { manifest: m, changed, removed, bytes: changed.reduce((a, f) => a + f.size, 0), first: !this.state.version };
  }

  /** Lädt geänderte Dateien zuerst in einen Zwischenspeicher und übernimmt sie erst, wenn ALLE da sind (kein halbes Update). */
  async apply(chk, onProgress = () => {}) {
    const stg = await staged(); let done = 0;
    const total = chk.bytes || 1; let got = 0;
    for (const f of chk.changed) {
      const key = abs(f.path) + '?v=' + f.hash;
      if (!(await stg.match(key))) {
        const r = await fetch(abs(f.path) + '?v=' + f.hash, { cache: 'reload' });
        if (!r.ok) throw new Error('Download fehlgeschlagen: ' + f.path + ' (' + r.status + ')');
        await stg.put(key, r);
      }
      got += f.size; done++; onProgress({ file: f.path, done, count: chk.changed.length, progress: Math.min(1, got / total) });
    }
    const st = this.state; st.files = st.files || {};
    for (const f of chk.changed) {                      // übernehmen
      const key = abs(f.path) + '?v=' + f.hash, r = await stg.match(key);
      await (await target(f.class)).put(new Request(abs(f.path)), r); st.files[f.path] = f.hash;
    }
    for (const p of chk.removed) { for (const n of ['finn-code', 'finn-data']) await (await caches.open(n)).delete(new Request(abs(p))); delete st.files[p]; }
    st.version = chk.manifest.version; st.built = chk.manifest.built; this._save(st);
    await caches.delete('finn-staging');
    return st.version;
  }
}
export const fmtMB = (b) => (b / 1e6 < 1 ? Math.max(1, Math.round(b / 1e3)) + ' KB' : (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB');
