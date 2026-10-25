# Finn der Fennek

Sprechender 3D-Fennek (Pixar-Stil) für Kinder-Software: Mimik, Lippensynchronität, Ohren, Sprechen mit lokalen Stimmen, Gespräch mit einem kleinen lokalen Sprachmodell, Englisch-Trainer (3. Klasse). Läuft komplett im Browser – ohne Cloud-API.

## Benutzen

**Online (GitHub Pages):** `https://hoai-droid.github.io/Finn/` (einmalig im Repo unter *Settings → Pages → Source: GitHub Actions* aktivieren; danach veröffentlicht jeder Push auf `main` automatisch).

**Lokal:** Repo herunterladen und `start.command` (Mac, Doppelklick), `start.bat` (Windows) oder `./start.sh` (Linux) starten – öffnet `http://localhost:8765/`. Alternativ: `cd web && python3 -m http.server 8765`.
Wichtig: nicht per Doppelklick auf `index.html` öffnen (Browser sperren dann Module/Modelle). Spracheingabe und Sprachmodell (WebGPU) brauchen Chrome oder Edge.

## Erste Schritte in der App
1. *Fennek-Stimme laden* (einmalig ca. 130 MB, danach offline).
2. *Modell laden* im Bereich Gespräch (einmalig 0,4–1,2 GB je Modell).
3. *Englisch lernen* → Thema wählen → Start.

## Updates
Die App besteht aus **Code** (klein: HTML/JS) und **Daten** (groß: Avatar-Modell, three.js, WASM, Stimmen, Sprachmodell). `manifest.json` (wird beim Veröffentlichen erzeugt) listet alle Dateien mit Hash. Der Button *Nach Updates suchen* oben im Panel vergleicht den Stand und lädt **nur geänderte Dateien** nach; Daten mit gleichem Hash bleiben unangetastet. Stimmen und Sprachmodelle liegen in eigenen Browser-Caches und sind von Updates nie betroffen. Beim ersten Start wird das Offline-Paket automatisch geladen (nur über http/https, nicht lokal ohne Manifest).

Neue Version veröffentlichen = Änderungen nach `main` pushen.

## Aufbau
- `web/` – die App (statisch): `index.html`, `avatar.js` (Avatar), `chat.js` (Gespräch/LLM/Spracherkennung), `tts.js` (Piper-Stimmen), `learn.js` (Englisch-Trainer), `updater.js` + `sw.js` (Updates/Offline), `lib/` (three.js, WebLLM, ONNX/Piper), `fennec_avatar.glb`, `atlas_meta.json`.
- `tools/avatar-pipeline/` – Python/Blender-Skripte, die aus dem Meshy-Modell den Avatar bauen (siehe dort).
- `tools/make-manifest.mjs` – erzeugt `web/manifest.json`.
- `source/` – Ausgangsmodell von Meshy.
- `tests/` – Playwright-Testskripte (headless).
- `docs/API.md` (Avatar-API), `docs/ROADMAP.md` (Pläne, Desktop-Apps).
