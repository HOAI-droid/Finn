#!/bin/bash
# Linux: ./start.sh – startet einen lokalen Server und öffnet Finn im Browser.
cd "$(dirname "$0")/web" || exit 1
PORT=8765
(sleep 1; xdg-open "http://localhost:$PORT/" >/dev/null 2>&1) &
python3 -m http.server $PORT
