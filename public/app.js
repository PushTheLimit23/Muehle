/* Mühle – Browser-Teil */
(() => {
  const R = window.Muehle;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- kleine Helfer ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let token = store.get('muehle.token');
  if (!token) { token = rand(24); store.set('muehle.token', token); }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // Nur die ersten 8 gültigen Zeichen zählen: Messenger hängen manchmal Text oder Satzzeichen an den Link.
  const roomId = ((new URLSearchParams(location.search).get('r') || '').toLowerCase().match(/^[a-z0-9]{8}/) || [''])[0];
  const brokenInvite = !roomId && /[?&]r=/i.test(location.search);
  if (roomId && location.search !== `?r=${roomId}`) history.replaceState(null, '', `${location.pathname}?r=${roomId}`);
  if (brokenInvite) history.replaceState(null, '', location.pathname);
  const roomLink = () => `${location.origin}${location.pathname}?r=${roomId}`;

  // ---------- Startseite ----------
  function showLobby() {
    $('lobby').hidden = false;
    $('nameInput').value = store.get('muehle.name') || '';
    if (brokenInvite) {
      $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Lass ihn dir bitte noch einmal schicken – oder starte hier eine eigene Partie.';
    } else if (roomId) {
      $('lobbyText').textContent = 'Du wurdest zu einer Partie Mühle eingeladen. Wie heißt du?';
      $('startBtn').textContent = 'Mitspielen';
    }
    $('nameForm').onsubmit = (e) => {
      e.preventDefault();
      const name = $('nameInput').value.trim().slice(0, 20);
      if (!name) return;
      store.set('muehle.name', name);
      if (roomId) { $('lobby').hidden = true; startGame(); }
      else location.href = `?r=${rand(8)}`;
    };
    loadHistory();
  }

  const REASONS = { pieces: 'nur noch 2 Steine', blocked: 'eingesperrt', resign: 'aufgegeben', quiet: '50 Züge ohne Mühle' };

  async function loadHistory() {
    try {
      const res = await fetch(`api/history?token=${encodeURIComponent(token)}`);
      const list = await res.json();
      if (!list.length) return;
      $('historyList').innerHTML = list.slice(0, 10).map((h) => {
        const opp = h.you === 1 ? h.black : h.white;
        const myColor = h.you === 1 ? 'white' : 'black';
        const res = h.winner === 'draw' ? ['Remis', ''] : h.winner === myColor ? ['Sieg', 'win'] : ['Niederlage', 'loss'];
        const d = new Date(h.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        return `<li><span>gegen <b>${esc(opp)}</b> <span class="when">· ${d} · ${REASONS[h.reason] || ''}</span></span><span class="res ${res[1]}">${res[0]}</span></li>`;
      }).join('');
      $('historyBox').hidden = false;
    } catch {}
  }

  // ---------- Brett zeichnen ----------
  const X = (u) => 80 + u * 90;
  const P = R.POINTS.map(([x, y]) => [X(x), X(y)]);
  const board = $('board');
  let layer; // dynamische Ebene

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function drawBoard() {
    board.innerHTML = `
      <defs>
        <linearGradient id="mahog" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8a3a1f"/>
          <stop offset=".45" stop-color="#6c2914"/>
          <stop offset="1" stop-color="#4b1a0b"/>
        </linearGradient>
        <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a1f0e"/><stop offset="1" stop-color="#321006"/>
        </linearGradient>
        <radialGradient id="sheen" cx=".3" cy=".2" r=".9">
          <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.11" numOctaves="4" seed="11"/>
          <feColorMatrix values="0 0 0 0 .16  0 0 0 0 .04  0 0 0 0 .01  1.6 0 0 0 -.62"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="fine" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.6" numOctaves="2" seed="3"/>
          <feColorMatrix values="0 0 0 0 .95  0 0 0 0 .55  0 0 0 0 .35  0 1.1 0 0 -.62"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <radialGradient id="wStone" cx=".38" cy=".32" r=".75">
          <stop offset="0" stop-color="#f6efe1"/><stop offset=".45" stop-color="#e6d8bb"/>
          <stop offset=".85" stop-color="#cfba93"/><stop offset="1" stop-color="#b29b72"/>
        </radialGradient>
        <radialGradient id="bStone" cx=".38" cy=".32" r=".75">
          <stop offset="0" stop-color="#8f7d70"/><stop offset=".4" stop-color="#4b3d35"/>
          <stop offset=".85" stop-color="#2f2520"/><stop offset="1" stop-color="#1c1512"/>
        </radialGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="5" stdDeviation="3.5" flood-color="#1a0500" flood-opacity=".55"/>
        </filter>
        <filter id="inset" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation=".6" flood-color="#2a0b02" flood-opacity=".8"/>
        </filter>
      </defs>
      <rect x="4" y="4" width="692" height="692" rx="28" fill="url(#frame)"/>
      <rect x="4" y="4" width="692" height="692" rx="28" fill="url(#mahog)" opacity=".55"/>
      <rect x="4" y="4" width="692" height="692" rx="28" filter="url(#grain)" fill="#000"/>
      <rect x="26" y="26" width="648" height="648" rx="14" fill="url(#mahog)"/>
      <rect x="26" y="26" width="648" height="648" rx="14" filter="url(#grain)" fill="#000"/>
      <rect x="26" y="26" width="648" height="648" rx="14" filter="url(#fine)" fill="#000" opacity=".35"/>
      <rect x="26" y="26" width="648" height="648" rx="14" fill="none" stroke="#2c0d04" stroke-opacity=".7" stroke-width="2"/>
      <rect x="4.5" y="4.5" width="691" height="691" rx="28" fill="none" stroke="#c98a5a" stroke-opacity=".25"/>
    `;
    const lines = el('g', { fill: 'none', stroke: '#e8cc9c', 'stroke-width': 7, 'stroke-linecap': 'square', filter: 'url(#inset)' }, board);
    for (const s of [0, 1, 2]) {
      const a = X(s), b = X(6 - s);
      el('rect', { x: a, y: a, width: b - a, height: b - a }, lines);
    }
    el('path', { d: `M${X(3)} ${X(0)}V${X(2)}M${X(3)} ${X(4)}V${X(6)}M${X(0)} ${X(3)}H${X(2)}M${X(4)} ${X(3)}H${X(6)}` }, lines);
    const dots = el('g', { filter: 'url(#inset)' }, board);
    for (const [x, y] of P) {
      el('circle', { cx: x, cy: y, r: 12, fill: '#e8cc9c' }, dots);
      el('circle', { cx: x, cy: y, r: 4.5, fill: '#7a3a1c' }, dots);
    }
    el('rect', { x: 4, y: 4, width: 692, height: 692, rx: 28, fill: 'url(#sheen)', 'pointer-events': 'none' }, board);
    layer = el('g', {}, board);
  }

  function stone(parent, p, color, cls = '') {
    const [x, y] = P[p];
    const g = el('g', { class: `stone ${cls}`, 'data-p': p }, parent);
    const inner = el('g', { filter: 'url(#shadow)' }, g);
    const white = color === 1;
    el('circle', { class: 'body', cx: x, cy: y, r: 33, fill: `url(#${white ? 'wStone' : 'bStone'})`, stroke: white ? '#8c7652' : '#100b09', 'stroke-width': 1.2 }, inner);
    el('circle', { cx: x, cy: y, r: 21, fill: 'none', stroke: white ? '#000' : '#fff', 'stroke-opacity': white ? .1 : .1, 'stroke-width': 2 }, inner);
    el('circle', { cx: x, cy: y, r: 22.5, fill: 'none', stroke: white ? '#fff' : '#fff', 'stroke-opacity': white ? .8 : .06, 'stroke-width': 1 }, inner);
    el('ellipse', { cx: x - 10, cy: y - 13, rx: 10, ry: 5.5, fill: '#fff', opacity: white ? .55 : .14, transform: `rotate(-30 ${x - 10} ${y - 13})` }, inner);
    return g;
  }

  // ---------- Spielzustand ----------
  let S = null;          // letzter Server-Zustand
  let prevBoard = null;  // für Animationen
  let selected = -1;
  let resultDismissed = false;

  function render() {
    if (!S) return;
    const g = S.game, me = S.you, opp = 3 - me;
    const myTurn = g.turn === me && !g.winner && S.players[1] && S.players[2];
    if (selected >= 0 && (!myTurn || g.board[selected] !== me || g.mustRemove)) selected = -1;

    layer.innerHTML = '';
    // frisch geschlossene Mühle hervorheben
    const changed = prevBoard && g.last && prevBoard[g.last.to] !== g.board[g.last.to];
    if (g.last?.mill && (g.mustRemove || changed)) {
      const [a, , c] = g.last.mill;
      el('line', { class: changed ? 'mill-line' : '', x1: P[a][0], y1: P[a][1], x2: P[c][0], y2: P[c][1], stroke: '#ffd88a', 'stroke-width': 10, 'stroke-linecap': 'round', opacity: .55 }, layer);
    }
    // letzter Zug markieren
    if (g.last && g.last.from != null) {
      el('circle', { cx: P[g.last.from][0], cy: P[g.last.from][1], r: 15, fill: 'none', stroke: '#ffd88a', 'stroke-opacity': .55, 'stroke-width': 3, 'stroke-dasharray': '4 5' }, layer);
    }
    // Steine
    const takeable = myTurn && g.mustRemove ? R.removable(g) : [];
    g.board.forEach((c, p) => {
      if (!c) return;
      let cls = '';
      if (p === selected) cls += ' sel';
      if (takeable.includes(p)) cls += ' takeable';
      const s = stone(layer, p, c, cls);
      if (takeable.includes(p)) el('circle', { cx: P[p][0], cy: P[p][1], r: 39, fill: 'none', stroke: '#ff8a5c', 'stroke-width': 3.5, 'stroke-dasharray': '7 6', 'pointer-events': 'none' }, s);
      if (prevBoard && g.last && p === g.last.to && prevBoard[p] !== c) {
        if (g.last.from != null) {
          s.classList.add('slide');
          s.style.setProperty('--dx', `${P[g.last.from][0] - P[p][0]}px`);
          s.style.setProperty('--dy', `${P[g.last.from][1] - P[p][1]}px`);
        } else s.classList.add('drop');
      }
    });
    // gerade geschlagener Stein verschwindet
    if (prevBoard && g.last?.removed != null && prevBoard[g.last.removed] && !g.board[g.last.removed]) {
      stone(layer, g.last.removed, prevBoard[g.last.removed], 'ghost-stone');
    }
    // Zielpunkte für gewählten Stein
    if (selected >= 0) {
      for (const t of R.targets(g, selected)) el('circle', { class: 'target', cx: P[t][0], cy: P[t][1], r: 17, fill: '#ffd88a', stroke: '#fff4d6', 'stroke-width': 3 }, layer);
    }
    // Klickflächen
    const hits = el('g', {}, layer);
    P.forEach(([x, y], p) => {
      const h = el('circle', { class: 'hit', cx: x, cy: y, r: 42, fill: 'transparent' }, hits);
      h.addEventListener('click', () => onPoint(p));
    });
    prevBoard = g.board.slice();

    // Spielerleisten
    for (const c of [1, 2]) {
      const box = $(`p${c}`), pl = S.players[c];
      box.querySelector('.pname').innerHTML = pl ? `${esc(pl.name)}${c === me ? ' <small>(du)</small>' : ''}` : '<small>wartet …</small>';
      box.querySelector('.hand').textContent = g.inHand[c] > 0 ? `${g.inHand[c]} übrig` : `${g.onBoard[c]} Steine`;
      box.classList.toggle('turn', !g.winner && g.turn === c && !!S.players[1] && !!S.players[2]);
      box.classList.toggle('offline', !!pl && !pl.online);
    }

    // Statuszeile
    const oppName = S.players[opp] ? esc(S.players[opp].name) : 'Mitspieler';
    let st = '';
    if (!S.players[opp]) st = 'Warte auf deinen Mitspieler …';
    else if (g.winner) st = g.winner === -1 ? 'Remis.' : g.winner === me ? '<b>Gewonnen!</b>' : `${oppName} hat gewonnen.`;
    else if (myTurn) {
      const ph = R.phase(g, me);
      if (g.mustRemove) st = `<b>Mühle!</b> Nimm einen Stein von ${oppName}.`;
      else if (ph === 'place') st = `Du bist dran: Setze einen Stein <span style="opacity:.6">(noch ${g.inHand[me]})</span>`;
      else if (selected >= 0) st = 'Wohin soll der Stein?';
      else if (ph === 'fly') st = 'Du hast nur noch 3 Steine – du darfst <b>springen</b>.';
      else st = 'Du bist dran: Ziehe einen Stein.';
    } else st = g.mustRemove ? `${oppName} hat eine Mühle und nimmt einen Stein …` : `${oppName} ist am Zug …`;
    if (S.players[opp] && !S.players[opp].online && !g.winner) st += ' <span style="opacity:.6">(nicht verbunden)</span>';
    $('status').innerHTML = st;

    // Einladung & Ergebnis
    $('invite').hidden = !!S.players[opp];
    $('linkText').textContent = roomLink();
    $('resignBtn').hidden = !!g.winner || !S.players[opp];
    $('againBtn').hidden = !g.winner;
    if (!g.winner) resultDismissed = false;
    $('result').hidden = !g.winner || resultDismissed;
    if (g.winner) {
      $('resultTitle').textContent = g.winner === -1 ? 'Remis' : g.winner === me ? 'Gewonnen! 🎉' : 'Verloren';
      const why = { pieces: g.winner === me ? `${S.players[opp]?.name} hat nur noch 2 Steine.` : 'Du hast nur noch 2 Steine.',
        blocked: g.winner === me ? `${S.players[opp]?.name} kann nicht mehr ziehen.` : 'Du kannst nicht mehr ziehen.',
        resign: g.winner === me ? `${S.players[opp]?.name} hat aufgegeben.` : 'Du hast aufgegeben.',
        quiet: '50 Züge ohne Mühle.' }[g.reason] || '';
      $('resultText').textContent = why;
      const iWant = S.rematch.includes(me), theyWant = S.rematch.includes(opp);
      $('rematchBtn').disabled = iWant;
      $('rematchBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('againBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('rematchHint').textContent = theyWant && !iWant ? `${S.players[opp]?.name} will eine Revanche!` : 'Bei einer Revanche werden die Farben getauscht.';
    }
  }

  function onPoint(p) {
    if (!S) return;
    const g = S.game, me = S.you;
    if (!S.players[3 - me]) return toast('Warte, bis dein Mitspieler da ist.');
    if (g.winner) return;
    if (g.turn !== me) return toast('Dein Mitspieler ist am Zug.');
    if (g.mustRemove) {
      if (g.board[p] !== 3 - me) return toast('Tippe auf einen Stein deines Mitspielers.');
      if (!R.removable(g).includes(p)) return toast('Steine in einer Mühle sind geschützt.');
      return send({ type: 'remove', p });
    }
    if (R.phase(g, me) === 'place') {
      if (g.board[p]) return;
      return send({ type: 'place', p });
    }
    if (g.board[p] === me) {
      if (!R.targets(g, p).length) { selected = -1; render(); return toast('Dieser Stein kann nicht ziehen.'); }
      selected = selected === p ? -1 : p;
      return render();
    }
    if (selected >= 0 && !g.board[p]) {
      if (!R.targets(g, selected).includes(p)) return toast('Dorthin geht es nicht – nur entlang der Linien.');
      const from = selected; selected = -1;
      return send({ type: 'move', from, to: p });
    }
    if (selected < 0) toast('Wähle zuerst einen deiner Steine.');
  }

  // ---------- Verbindung ----------
  let ws, retry = 0, gaveUp = false;
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else toast('Keine Verbindung – versuche es gleich nochmal.'); }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}${location.pathname.replace(/[^/]*$/, '')}ws`);
    ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ type: 'join', room: roomId, name: store.get('muehle.name'), token })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'state') { S = m; render(); }
      else if (m.type === 'error') toast(m.msg);
      else if (m.type === 'full') { gaveUp = true; $('game').hidden = true; $('full').hidden = false; }
    };
    ws.onclose = (e) => {
      if (gaveUp || e.code === 4000) return;
      $('status').textContent = 'Verbindung unterbrochen – verbinde neu …';
      setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
    };
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ws && ws.readyState > 1 && !gaveUp) connect();
  });

  async function share() {
    const url = roomLink();
    if (navigator.share) { try { await navigator.share({ title: 'Spielst du eine Runde Mühle mit mir?', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    copy();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(roomLink()); toast('Link kopiert ✓'); }
    catch { prompt('Link kopieren:', roomLink()); }
  }

  function startGame() {
    $('game').hidden = false;
    drawBoard();
    $('shareBtn').onclick = share;
    $('copyBtn').onclick = copy;
    $('resignBtn').onclick = () => { if (confirm('Wirklich aufgeben?')) send({ type: 'resign' }); };
    $('rematchBtn').onclick = $('againBtn').onclick = () => send({ type: 'rematch' });
    $('closeResult').onclick = () => { resultDismissed = true; render(); };
    connect();
  }

  window.__muehleState = () => S; // nur zur Fehlersuche
  if (roomId && store.get('muehle.name')) startGame();
  else showLobby();
})();
