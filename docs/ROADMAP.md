# Roadmap

## Stand (Browser-Version, läuft)
Avatar mit Mimik/Lippensynchronität/Ohren, Sprechen (Browser-TTS oder Piper-Stimmen lokal), Gespräch (Regeln + WebLLM im Browser), Spracherkennung (Chrome), Diktat-Demo, Englisch-Trainer, Update-Button (nur geänderte Dateien).

**v0.2 „Finn kennt dich“:** Kennenlern-Runde (Name, Alter, Klasse, Lieblingstier, Hobby), Gedächtnis lokal in IndexedDB (Steckbrief, gemerkte Sätze, Termine, Gesprächszusammenfassungen), persönliche Begrüßung mit Nachfrage („Wie war dein Turnier?“), aktive Fragen in Gesprächspausen, Elternbereich zum Ansehen/Ändern/Löschen.

## Nächste Schritte
0. **Gedächtnis ausbauen:** mehrere Kinder (Profil wählen), Lernfortschritt Englisch/Diktat pro Wort (Karteikasten), Fakten auch per LLM erkennen (größeres Modell), Export/Import fürs Umziehen auf ein anderes Gerät.
1. **Echte Tests mit Kind** (Stimmenpaar Ramona/Jenny, Verständlichkeit, Antwortqualität des LLM auf Deutsch).
2. **Fortschritt pro Kind** speichern (IndexedDB/Datei), schwierige Wörter öfter wiederholen, Elternbereich (Wortlisten ergänzen, Statistik).
3. **Lehrplan prüfen**: Wortschatz in `web/learn.js` (`TOPICS`) gegen das Englischbuch der Schule abgleichen.
4. **Desktop-Apps (Mac, Windows, Linux)** – siehe unten.
5. Mehr Körperanimationen (Mixamo: Idle, Winken, Tanzen), bessere Lippensynchronität (Phonemzeiten aus Piper statt Textheuristik).

## Desktop-Apps: Stand
Mac-Testversion mit Electron 44 (`desktop/`, Build per GitHub Actions auf macOS, nur ad-hoc signiert, keine Apple-Beglaubigung). Lokaler Server auf festem Port 47831 → feste Herkunft für IndexedDB/Cache (Gedächtnis, Stimmen, Modelle bleiben erhalten). Offen: Whisper-Spracheingabe, Apple-Developer-Signatur + Notarisierung, Updates über GitHub Pages, Windows/Linux-Builds.

## Desktop-Apps: Entscheidungsgrundlage
Ziel: dieselbe Web-App (`web/`) in einer Hülle, Update über den vorhandenen Updater (Code klein, Daten einmalig).

| | Electron | Tauri |
|---|---|---|
| Browser-Engine | eingebautes Chromium (überall gleich, WebGPU ok) | System-WebView (Mac: WebKit, Win: WebView2/Chromium, Linux: WebKitGTK) |
| WebGPU/WebLLM | zuverlässig | Mac/Win ok, **Linux unsicher** |
| Größe | ca. 100–150 MB | ca. 5–10 MB |
| Browser-Spracherkennung (`SpeechRecognition`) | **funktioniert nicht** ohne Google-Schlüssel | je nach WebView unsicher |

**Wichtigster Punkt:** Die Browser-Spracherkennung ist nur in Chrome/Edge/Safari mit Online-Dienst verfügbar. Für eine echte Offline-App wird lokale Spracherkennung gebraucht (Whisper, z. B. `whisper.cpp` nativ oder `transformers.js` im Browser) – das ist der größte offene Baustein.
Empfehlung: zuerst Electron (ein Chromium überall), Whisper-STT einbauen; native LLM-Variante (llama.cpp) optional, wenn WebGPU auf alten Geräten fehlt.

**Update-Idee für die Apps:** Die App liefert `web/` mitgeliefert aus; der Updater lädt `manifest.json` von der GitHub-Pages-Adresse und legt geänderte Dateien in den Programmdaten-Ordner ab (statt Cache API). Große Dateien (Modell, WASM, Stimmen) bleiben, solange der Hash gleich ist. Eine neue Hülle (Electron-Version) ist nur bei Änderungen am nativen Teil nötig.

## Rechtliches / Kinder
- Stimmen: Piper-Stimme Thorsten (CC0), Ramona/Jenny – Lizenz je Stimme prüfen. **espeak-ng (GPL)** steckt im Phonemisierer: vor kommerzieller Nutzung klären.
- LLM-Lizenzen: Qwen (Apache-2.0 bzw. Qwen-Lizenz je Größe), Llama 3.2 (Llama-Lizenz) prüfen.
- Datenschutz: Alles läuft lokal, keine Daten verlassen das Gerät (Browser-Spracherkennung in Chrome sendet Audio an Google – bei lokalem Whisper entfällt das).
