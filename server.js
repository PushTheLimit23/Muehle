// Mühle – Echtzeit-Server für zwei Spieler pro Raum (per geteiltem Link)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const R = require('./public/rules.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY = 1000;

// ---------- Spielhistorie (Datei im Persistent Storage) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { history = []; }
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE + '.tmp', JSON.stringify(history));
    fs.renameSync(HISTORY_FILE + '.tmp', HISTORY_FILE);
  } catch (e) { console.error('Historie konnte nicht gespeichert werden:', e.message); }
}

// ---------- Statische Dateien ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/api/history') {
    const token = url.searchParams.get('token') || '';
    const mine = history.filter((h) => h.tokens.includes(token)).slice(-50).reverse()
      .map(({ tokens, ...h }) => ({ ...h, you: tokens.indexOf(token) + 1 }));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(mine));
  }
  let file = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  file = path.join(PUBLIC, file);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // unbekannte Pfade → Startseite (damit Links nie ins Leere führen)
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => {
        res.writeHead(e2 ? 404 : 200, { 'content-type': TYPES['.html'] });
        res.end(e2 ? 'Nicht gefunden' : d2);
      });
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Räume ----------
// room = { id, seats: [null, seat, seat], game, rematch:Set, touched, recorded }
// seat = { token, name, ws }
const rooms = new Map();
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    r = { id, seats: [null, null, null], game: R.newGame(), rematch: new Set(), touched: Date.now(), recorded: false };
    rooms.set(id, r);
  }
  return r;
}

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function broadcast(r, extra = {}) {
  const players = [null, 1, 2].map((c) => c && r.seats[c]
    ? { name: r.seats[c].name, online: !!(r.seats[c].ws && r.seats[c].ws.readyState === 1) }
    : null);
  for (const c of [1, 2]) {
    const s = r.seats[c];
    if (s) send(s.ws, { type: 'state', room: r.id, you: c, players, game: r.game, rematch: [...r.rematch], ...extra });
  }
}

function recordIfOver(r) {
  const g = r.game;
  if (!g.winner || r.recorded) return;
  r.recorded = true;
  history.push({
    date: new Date().toISOString(),
    white: r.seats[1]?.name || '?',
    black: r.seats[2]?.name || '?',
    tokens: [r.seats[1]?.token, r.seats[2]?.token],
    winner: g.winner === -1 ? 'draw' : g.winner === 1 ? 'white' : 'black',
    reason: g.reason,
    moves: g.moves,
  });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory();
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null, color = 0;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'join') {
      const id = clean(m.room, 16);
      const token = clean(m.token, 64);
      const name = clean(m.name, 20) || 'Gast';
      if (!/^[a-z0-9]{4,16}$/.test(id) || token.length < 8) return send(ws, { type: 'error', msg: 'Ungültiger Spiel-Link.' });
      const r = getRoom(id);
      // Wiederkehrender Spieler? Sonst freien Platz nehmen.
      let c = [1, 2].find((k) => r.seats[k] && r.seats[k].token === token);
      if (!c) c = [1, 2].find((k) => !r.seats[k]);
      if (!c) return send(ws, { type: 'full' });
      const old = r.seats[c]?.ws;
      if (old && old !== ws) { try { old.close(4000, 'replaced'); } catch {} }
      r.seats[c] = { token, name, ws };
      room = r; color = c; r.touched = Date.now();
      return broadcast(r);
    }

    if (!room) return;
    room.touched = Date.now();
    const g = room.game;

    if (m.type === 'rematch') {
      if (!g.winner) return;
      room.rematch.add(color);
      if (room.rematch.size === 2) {
        // Farben tauschen: wer vorher Schwarz war, beginnt jetzt mit Weiß
        [room.seats[1], room.seats[2]] = [room.seats[2], room.seats[1]];
        room.game = R.newGame();
        room.rematch.clear();
        room.recorded = false;
        // Verbindungen neu den Farben zuordnen
        for (const c of [1, 2]) if (room.seats[c]?.ws) room.seats[c].ws.emit('recolor', c);
      }
      return broadcast(room);
    }

    if (m.type === 'resign') {
      if (g.winner || !room.seats[1] || !room.seats[2]) return;
      g.winner = 3 - color; g.reason = 'resign';
      recordIfOver(room);
      return broadcast(room);
    }

    if (['place', 'move', 'remove'].includes(m.type)) {
      if (!room.seats[1] || !room.seats[2]) return send(ws, { type: 'error', msg: 'Warte auf deinen Mitspieler.' });
      const err = R.apply(g, color, { type: m.type, p: m.p, from: m.from, to: m.to });
      if (err) return send(ws, { type: 'error', msg: err });
      recordIfOver(room);
      return broadcast(room);
    }
  });

  ws.on('recolor', (c) => { color = c; });
  ws.on('close', () => { if (room) broadcast(room); });
});

// Tote Verbindungen erkennen (z. B. Handy im Standby)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

// Verwaiste Räume nach 24 h aufräumen
setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [id, r] of rooms) {
    const online = [1, 2].some((c) => r.seats[c]?.ws?.readyState === 1);
    if (!online && r.touched < cutoff) rooms.delete(id);
  }
}, 3600 * 1000);

server.listen(PORT, () => console.log(`Mühle läuft auf Port ${PORT}`));
