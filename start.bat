@echo off
rem Windows: Doppelklick. Startet einen lokalen Server und öffnet Finn im Browser (Python 3 nötig).
cd /d "%~dp0web"
start "" "http://localhost:8765/"
python -m http.server 8765 || py -m http.server 8765
