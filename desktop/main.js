// Finn als Desktop-App (Electron): liefert die Web-App aus web/ über einen lokalen Server (nur 127.0.0.1) aus
// und zeigt sie in einem eigenen Fenster. Fester Port = feste Herkunft, damit Gedächtnis, Stimmen und Modelle erhalten bleiben.
const { app, BrowserWindow, session, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 47831;
const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.onnx': 'application/octet-stream', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8' };

// WebGPU (für das lokale Sprachmodell) sicher einschalten
app.commandLine.appendSwitch('enable-unsafe-webgpu');

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('nicht gefunden'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  // Mikrofon & Co. nur für unsere eigene Seite erlauben
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const own = (details.requestingUrl || wc.getURL()).startsWith(`http://127.0.0.1:${PORT}/`);
    cb(own && ['media', 'microphone', 'audioCapture', 'speaker-selection'].includes(perm));
  });
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 700, minHeight: 500, title: 'Finn', backgroundColor: '#eaf2f7',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links nach außen im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${PORT}/`)) { e.preventDefault(); shell.openExternal(url); } });
  await win.loadURL(`http://127.0.0.1:${PORT}/index.html`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(async () => {
    try { await serve(); }
    catch (e) {
      const { dialog } = require('electron');
      dialog.showErrorBox('Finn kann nicht starten', `Der lokale Port ${PORT} ist belegt (${e.code || e.message}). Bitte andere Finn-Fenster schließen und neu starten.`);
      return app.quit();
    }
    await createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
