# Finn der Fennek

Sprechender 3D-Fennek (Pixar-Stil) für Kinder-Software: Mimik, Lippensynchronität, Ohren, Sprechen mit lokalen Stimmen, Gespräch mit einem kleinen lokalen Sprachmodell, Englisch-Trainer (3. Klasse). Läuft komplett im Browser – ohne Cloud-API.

## Benutzen

**Online (GitHub Pages):** `https://hoai-droid.github.io/Finn/` (einmalig im Repo unter *Settings → Pages → Source: GitHub Actions* aktivieren; danach veröffentlicht jeder Push auf `main` automatisch).

**Lokal:** Repo herunterladen und `start.command` (Mac, Doppelklick), `start.bat` (Windows) oder `./start.sh` (Linux) starten – öffnet `http://localhost:8765/`. Alternativ: `cd web && python3 -m http.server 8765`.
Wichtig: nicht per Doppelklick auf `index.html` öffnen (Browser sperren dann Module/Modelle). Spracheingabe und Sprachmodell (WebGPU) brauchen Chrome oder Edge.

**Mac-App (Testversion):** Unter *Actions → „Mac-App bauen“* den neuesten Lauf öffnen und unten *Finn-Mac-AppleSilicon* (M1/M2/M3/M4) bzw. *Finn-Mac-Intel* herunterladen. ZIP entpacken, DMG öffnen, *Finn* in *Programme* ziehen.
Die App ist nicht von Apple beglaubigt. Beim ersten Start daher: Rechtsklick auf *Finn* → *Öffnen*. Klappt das nicht: *Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“*, oder im Terminal `xattr -dr com.apple.quarantine /Applications/Finn.app`.
In der App funktioniert die Spracheingabe noch nicht (dafür braucht es lokales Whisper), Tippen geht. Alles andere – Stimmen, Sprachmodell, Gedächtnis – wie im Browser.
Selbst starten ohne Build: `cd desktop && npm install && npm start`.

## Erste Schritte in der App
1. *Fennek-Stimme laden* (einmalig ca. 130 MB, danach offline).
2. *Modell laden* im Bereich Gespräch (einmalig 0,4–1,2 GB je Modell).
3. *👋 Hallo Finn* – beim ersten Mal lernt Finn das Kind kennen (Name, Alter, Klasse, Lieblingstier, Hobby), später begrüßt er es persönlich und fragt nach („Wie war dein Fußballturnier?“).
4. *Englisch lernen* → Thema wählen → Start.

Was Finn sich merkt, steht unter *Eltern: Was Finn sich merkt* (ändern, einzeln löschen, alles vergessen). Gespeichert wird nur im Browser auf diesem Gerät.

## Updates
Die App besteht aus **Code** (klein: HTML/JS) und **Daten** (groß: Avatar-Modell, three.js, WASM, Stimmen, Sprachmodell). `manifest.json` (wird beim Veröffentlichen erzeugt) listet alle Dateien mit Hash. Der Button *Nach Updates suchen* oben im Panel vergleicht den Stand und lädt **nur geänderte Dateien** nach; Daten mit gleichem Hash bleiben unangetastet. Stimmen und Sprachmodelle liegen in eigenen Browser-Caches und sind von Updates nie betroffen. Beim ersten Start wird das Offline-Paket automatisch geladen (nur über http/https, nicht lokal ohne Manifest).

Neue Version veröffentlichen = Änderungen nach `main` pushen.

## Aufbau
- `web/` – die App (statisch): `index.html`, `avatar.js` (Avatar), `chat.js` (Gespräch/LLM/Spracherkennung), `memory.js` (Gedächtnis/Kennenlernen/Nachfragen), `tts.js` (Piper-Stimmen), `learn.js` (Englisch-Trainer), `updater.js` + `sw.js` (Updates/Offline), `lib/` (three.js, WebLLM, ONNX/Piper), `fennec_avatar.glb`, `atlas_meta.json`.
- `desktop/` – Electron-Hülle für Mac (später Windows/Linux): `main.js` liefert `web/` über `http://127.0.0.1:47831` aus; Build per `.github/workflows/mac-app.yml`.
- `tools/avatar-pipeline/` – Python/Blender-Skripte, die aus dem Meshy-Modell den Avatar bauen (siehe dort).
- `tools/make-manifest.mjs` – erzeugt `web/manifest.json`.
- `source/` – Ausgangsmodell von Meshy.
- `tests/` – Playwright-Testskripte (headless).
- `docs/API.md` (Avatar-API), `docs/ROADMAP.md` (Pläne, Desktop-Apps).
