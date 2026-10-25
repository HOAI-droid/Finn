#!/bin/bash
# macOS: Doppelklick (einmalig: chmod +x start.command). Startet einen lokalen Server und öffnet Finn im Browser.
cd "$(dirname "$0")/web" || exit 1
PORT=8765
(sleep 1; open "http://localhost:$PORT/") &
python3 -m http.server $PORT
