# Fennek-Avatar (sprechend, mit Mimik)

## Starten
Im Ordner einen lokalen Webserver starten (Browser erlauben `file://` nicht für Module/GLB):

    python3 -m http.server 8000      # dann http://localhost:8000 öffnen

`index.html` ist der Test-Viewer: Sprechen, Diktat-Demo, Vorlesen mit Wort-Hervorhebung, Gefühle, Reaktionen,
Augen/Brauen/Mund einzeln, Körper-Animationen, Kamera.

## Dateien
- `fennec_avatar.glb` – Modell: 59.791 Vertices, Mixamo-Skelett (32 Bones) + 6 Ohr-Bones (`Ear_L_1..3`, `Ear_R_1..3`),
  3 Animationen (Walking, Casual_Walk, Running), Gesichts-Overlays `Face_EyeL/EyeR/BrowL/BrowR/Mouth`.
- `avatar.js` – `FennecAvatar`-Klasse (three.js), die API unten.
- `atlas_meta.json` – Raster der Gesichts-Atlanten (Zellgröße, Spalten, Zustandsnamen).
- `assets/` – die Atlanten als PNG (Augen, Brauen, Mund, Rauheit der Augen) und die bereinigte Basistextur.
- `tools/` – die Skripte, mit denen alles erzeugt wurde (Blender als Python-Modul `bpy`, OpenCV, pycairo).

## Wie das Gesicht funktioniert
Augen, Brauen und Mund der Originaltextur wurden aus der Basistextur entfernt. Darüber liegen fünf dünne,
mitgeskinnte Flächen (Kopf-Bone), deren Textur ein Atlas mit vorgezeichneten Zuständen ist. Zustandswechsel =
UV-Verschiebung (`texture.offset`) auf die passende Zelle. Das funktioniert in jeder Engine; nur der Code für
den Wechsel muss dort neu geschrieben werden (Unity: `material.SetTextureOffset`, Godot: `uv1_offset`).
Im GLB steht jede Fläche auf ihrer Standardzelle (Augen: offen/geradeaus, Brauen: neutral, Mund: `sil`).

## API (alle "links/rechts" = Seite der Figur)
    const a = new FennecAvatar(); await a.load('./fennec_avatar.glb','./atlas_meta.json'); scene.add(a.root);
    a.update(dt);                          // jedes Frame
    a.setEmotion('happy'|'joy'|'sad'|'surprised'|'angry'|'thinking'|'worried'|'sleepy'|'neutral');
    a.setEyes('open'|'half'|'blink'|'closed'|'happy'|'sad'|'angry'|'sleepy'|'surprised', 'both'|'left'|'right');
    a.setBrows('neutral'|'up'|'high'|'down'|'angry'|'sad'|'worried'|'skeptic', rightBrowName?);
    a.setGaze(x, y);                       // -1..1, x: Betrachter-rechts +, y: oben +  (3x3 Raster)
    a.setMouth('sil'|'PP'|'FF'|'TH'|'DD'|'kk'|'CH'|'SS'|'nn'|'RR'|'aa'|'E'|'I'|'O'|'U'|'smile'|'laugh'|'frown'|'surprised');
    a.react('eyeroll'|'shake'|'nod'|'giggle'|'wink'|'oops'|'think');
    a.speak('Text', {lang:'de-DE', rate:1, silent:false, onend});      // Browser-TTS + Mundbewegung
    a.playVisemes([{t:0,v:'sil'},{t:.12,v:'aa'},...], onend);          // eigene Zeitleiste (Oculus-Visemnamen)
    a.attachAudio(audioElementOrMediaStream);                         // Lautstärke-gesteuert, ohne Phoneme
    a.onWord = (charIndex) => {...};                                  // für Wort-Hervorhebung beim Vorlesen
    a.playBody('Walking'|'Casual_Walk'|'Running'); a.stopBody();      // Mixamo-Clips; sonst prozedurales Idle
    a.autoBlink = a.autoEars = a.autoIdle = true|false;

## Bessere Stimme / echte Lippensynchronität
`speak()` nutzt die Sprachausgabe des Browsers. Sie liefert nur Wortgrenzen, der Mund folgt daher dem Text
(Buchstaben -> Viseme) und wird an jeder Wortgrenze nachsynchronisiert. Für feste, hochwertige Stimmen:
Cloud-TTS mit Viseme-Ereignissen (z. B. Azure Speech) oder lokales TTS mit Phonemzeiten (z. B. Piper) liefern;
die Zeitleiste dann an `playVisemes()` übergeben und das Audio parallel abspielen. Für vorab aufgenommene
Kindersoftware-Texte lassen sich die Zeitleisten einmal erzeugen und mit den Audiodateien ausliefern.

## Weitere Animationen
Das Skelett hat Mixamo-Namen. Beliebige Mixamo-Animationen (Idle, Winken, Tanzen, Springen ...) laufen direkt:
auf mixamo.com ohne Skin herunterladen, per Blender/`gltf-transform` in dieselbe GLB einbetten oder separat
laden und mit `a.mixer.clipAction(clip)` abspielen.

## Gespräch mit dem Fennek (lokale KI, ohne Cloud)
Im Viewer oben: Modell wählen, "Modell laden", dann Mikrofon-Knopf gedrückt halten und sprechen (oder tippen).
- Spracherkennung: Browser (`SpeechRecognition`, Deutsch). Chrome/Edge am Computer am zuverlässigsten; in Chrome geht das Audio dabei an Google.
- Antwort: feste Regeln für Alltagssätze (Hallo, Wie heißt du, Tschüss ...), sonst ein kleines Sprachmodell im Browser (WebLLM, WebGPU).
  Das Modell wird beim ersten Laden aus dem Internet geholt (Hugging Face) und danach im Browser gespeichert. Ohne Modell antwortet Finn nur mit festen Sätzen.
- Das Modell liefert zu jeder Antwort ein Gefühl in eckigen Klammern (`[happy] ...`), das steuert die Mimik. Der Prompt steht in `chat.js` (`SYSTEM`).
- Sprachausgabe: Browser-Stimme (`stumm` schaltet nur die Töne ab, der Mund bewegt sich weiter).
- `index.html?mock=1` benutzt ein Test-Modell ohne Download, um die Abläufe zu prüfen.
Hinweis: Der Ablauf mit dem echten Modell ließ sich in der Entwicklungsumgebung nicht ausprobieren (kein WebGPU, kein Modell-Download). Das Test-Modell hat die Abläufe bestätigt, die Antwortqualität auf Deutsch musst Du selbst prüfen.

## Bekannte Grenzen
- Das Modell hat keinen Schwanz (fehlt im Mesh).
- Mund und Augen sind gezeichnete 2D-Flächen auf dem Kopf (kein Kiefer, keine echte Mundhöhle). Von der Seite
  und leicht von schräg wirkt das sauber, bei extremen Winkeln ist es erkennbar flach.
- Blick ist auf ein 3x3-Raster quantisiert.
- Die GLB ist ca. 22 MB (Normal- und Farbtextur 2048 px als PNG); für Web/Mobil später als KTX2/JPEG komprimieren.
- Die Blend-Reihenfolge der Overlays (`alphaMode: BLEND`) muss in anderen Engines passend gesetzt werden
  (Brauen vor Augen vor Mund vor Haut).

## Stimme (Piper, Open Source)
- `tts.js` (`PiperTTS`) lädt eine Piper-Stimme (Thorsten u. a.) einmalig von Hugging Face in den Browser-Cache und erzeugt die Sprache lokal (ONNX/WASM, ohne WebGPU).
- `avatar.tts = piper` aktiviert sie für `speak()`/`speakLong()`/Chat; `avatar.tts = null` = Browser-Stimme. `avatar.voicePitch` (0.85–1.3) verändert die Tonhöhe (Charakterstimme).
- Der Mund wird auf die echte Audiolänge gestreckt. Vorab-Synthese des nächsten Satzes: `avatar.prefetch(text)`.
- Lizenz-Hinweis: Das Phonemisierungs-Modul nutzt espeak-ng (GPL). Für ein kommerzielles Produkt vorher prüfen; Stimmen-Lizenz je Stimme (Thorsten: CC0).

## Englisch lernen (learn.js)
`EnglishTrainer(avatar, ui)`: Themen (Colours, Numbers, Animals, Family, Body, Food, School, Weather) in `TOPICS` – leicht erweiterbar. Modi: Sprechen/Tippen gemischt, nur Tippen, nur Sprechen (Spracherkennung en-US), Hören & Tippen. Der Fennek spricht das englische Wort erst bei richtiger Antwort; bei falscher Antwort schweigt er und reagiert (Augen verdrehen usw.). Englische Piper-Stimme: `avatar.ttsEn = piperEn`.
