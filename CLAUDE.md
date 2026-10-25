# Finn der Fennek – Projektkontext für Claude Code

**Besitzer:** Sebastian (Deutsch, knappe Antworten gewünscht). Ziel: sprechender Fennek-Avatar für eine Kindersoftware (seine Tochter ist Grundschulkind) – Rechtschreib-Diktat, Vorlesen, Gespräch, Englisch lernen (3. Klasse Hessen). Später als Mac-/Windows-/Linux-App mit Update-Button.

## Architektur (siehe README.md, docs/ROADMAP.md)
- Statische Web-App in `web/` ohne Build-Schritt (ES-Module, three.js 0.170 und WebLLM unter `web/lib/` gebündelt). Relative URLs überall (läuft unter `/Finn/` auf GitHub Pages).
- **Avatar** (`web/avatar.js`, API in `docs/API.md`): Meshy-GLB mit Mixamo-Skelett; Gesicht wurde aus der Textur entfernt und durch Overlay-Patches (Augen, Brauen, Mund) mit Atlas-Texturen ersetzt; Zustandswechsel per `texture.offset`. Ohren per Knochen (`Ear_{L,R}_{1..3}`, Weltachsen). glTF blickt +Z. „links/rechts" in der API = Seite der Figur.
- **Sprache:** `avatar.speak()` (Browser-TTS, onboundary-Resync) oder Piper (`web/tts.js`, ONNX/WASM, Stimmenpaar Ramona de + Jenny en in `PAIR` in `index.html`; `avatar.tts` / `avatar.ttsEn`). Mundbewegung: deutsche Text→Viseme-Heuristik, bei Piper auf Audiolänge gestreckt; Englisch aus Lautstärkekurve. Phonem-IDs ≥ `num_symbols` werden verworfen (sonst ORT-Fehler).
- **Gespräch** (`web/chat.js`): Regeln + WebLLM (Qwen/Llama q4), Antwortformat `[emotion] Text`, satzweise TTS-Warteschlange, `?mock=1` = Test-Modell ohne Download. Spracheingabe: Browser-`SpeechRecognition` (nur Chrome/Edge).
- **Englisch-Trainer** (`web/learn.js`): `TOPICS` erweitern. Fennek spricht das Wort erst bei richtiger Antwort.
- **Updates:** `tools/make-manifest.mjs` erzeugt `web/manifest.json` (Hash je Datei, Klasse code/data); `web/updater.js` lädt nur Geändertes in Cache (`finn-code`/`finn-data`, Staging → atomar), `web/sw.js` liefert aus dem Cache. Stimmen (`fennec-piper-v1`) und LLM-Modelle (WebLLM) haben eigene Caches. CI: `.github/workflows/pages.yml` (Pages-Deploy bei Push auf `main`).

## Entwickeln/Testen
- Lokal: `cd web && python3 -m http.server 8765`, dann `http://localhost:8765/?mock=1`. Manifest lokal erzeugen: `node tools/make-manifest.mjs web` (nicht committen, in `.gitignore`).
- Headless-Tests (`tests/`, Playwright/Chromium, Software-GL): **kleines Viewport (420×300)** verwenden, sonst verhungern Timer. Kein WebGPU, keine Sprachausgabe, kein Zugriff auf Hugging Face in der Sandbox → Piper mit `tests/fake.onnx` (Platzhaltermodell) testen, `speechSynthesis` stubben (siehe `tests/t_speak.py`).
- Chrome-Eigenheiten: `speechSynthesis.speak()` direkt nach `cancel()` kann verloren gehen (Verzögerung eingebaut); AudioContext erst nach Nutzerinteraktion.

## Bekannte Punkte / offen
- Piper-Inferenz läuft im Hauptthread (Animation kann beim Synthetisieren kurz ruckeln) → Worker.
- Qwen2.5 1.5B hängt gelegentlich `</think>` an und hält die Zwei-Satz-Regel nicht immer (Bereinigung in `chat.js` `stripThink`).
- Desktop-Apps: Entscheidungsgrundlage in `docs/ROADMAP.md` (Spracherkennung offline = größter Baustein).
- Lizenz espeak-ng (GPL) vor kommerzieller Nutzung klären.
