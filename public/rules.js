// Mühle-Regeln – wird vom Server UND vom Browser benutzt (eine Quelle der Wahrheit).
(function (root) {
  // 24 Punkte auf einem 7x7-Raster: [x, y]
  const POINTS = [
    [0, 0], [3, 0], [6, 0],
    [1, 1], [3, 1], [5, 1],
    [2, 2], [3, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
    [2, 4], [3, 4], [4, 4],
    [1, 5], [3, 5], [5, 5],
    [0, 6], [3, 6], [6, 6],
  ];

  // Alle 16 möglichen Mühlen (drei in einer Linie)
  const MILLS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
    [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
  ];

  // Nachbarn: aufeinanderfolgende Punkte einer Linie sind verbunden
  const ADJ = POINTS.map(() => []);
  for (const [a, b, c] of MILLS) {
    ADJ[a].push(b); ADJ[b].push(a);
    ADJ[b].push(c); ADJ[c].push(b);
  }

  const PIECES = 9;
  const DRAW_AFTER = 100; // 50 Züge je Spieler ohne Mühle in der Zugphase = Remis

  function newGame() {
    return {
      board: Array(24).fill(0), // 0 leer, 1 Weiß, 2 Schwarz
      turn: 1,                  // Weiß beginnt
      inHand: [0, PIECES, PIECES],
      onBoard: [0, 0, 0],
      mustRemove: false,        // gerade Mühle geschlossen → Stein des Mitspielers nehmen
      winner: 0,                // 0 läuft, 1/2 Sieger, -1 Remis
      reason: '',
      last: null,               // {from, to, removed, mill:[...]}
      quiet: 0,
      moves: 0,
    };
  }

  const phase = (g, c) => (g.inHand[c] > 0 ? 'place' : g.onBoard[c] === 3 ? 'fly' : 'move');

  function millAt(board, p) {
    const c = board[p];
    if (!c) return null;
    return MILLS.find((m) => m.includes(p) && m.every((q) => board[q] === c)) || null;
  }

  // Steine des Mitspielers, die genommen werden dürfen:
  // keine aus Mühlen – außer alle stehen in Mühlen.
  function removable(g) {
    const o = 3 - g.turn;
    const all = [];
    for (let p = 0; p < 24; p++) if (g.board[p] === o) all.push(p);
    const free = all.filter((p) => !millAt(g.board, p));
    return free.length ? free : all;
  }

  function targets(g, from) {
    const c = g.board[from];
    if (!c) return [];
    const pool = phase(g, c) === 'fly' ? POINTS.map((_, i) => i) : ADJ[from];
    return pool.filter((q) => g.board[q] === 0);
  }

  function hasMove(g, c) {
    if (g.inHand[c] > 0) return g.board.includes(0);
    for (let p = 0; p < 24; p++) if (g.board[p] === c && targets(g, p).length) return true;
    return false;
  }

  function endTurn(g) {
    const me = g.turn, o = 3 - me;
    g.moves++;
    if (g.inHand[o] + g.onBoard[o] < 3) { g.winner = me; g.reason = 'pieces'; return; }
    if (!hasMove(g, o)) { g.winner = me; g.reason = 'blocked'; return; }
    if (g.inHand[1] === 0 && g.inHand[2] === 0 && ++g.quiet >= DRAW_AFTER) { g.winner = -1; g.reason = 'quiet'; return; }
    g.turn = o;
  }

  function afterLanding(g, p) {
    const mill = millAt(g.board, p);
    if (mill) {
      g.last.mill = mill;
      g.quiet = 0;
      if (removable(g).length) { g.mustRemove = true; return; }
    }
    endTurn(g);
  }

  // Führt eine Aktion aus. Gibt eine Fehlermeldung zurück oder null bei Erfolg.
  function apply(g, color, a) {
    if (g.winner) return 'Das Spiel ist vorbei.';
    if (color !== g.turn) return 'Du bist nicht am Zug.';
    const ok = (p) => Number.isInteger(p) && p >= 0 && p < 24;

    if (g.mustRemove) {
      if (a.type !== 'remove' || !ok(a.p)) return 'Nimm zuerst einen Stein deines Mitspielers.';
      if (!removable(g).includes(a.p)) return 'Steine in einer Mühle sind geschützt.';
      g.board[a.p] = 0;
      g.onBoard[3 - color]--;
      g.last.removed = a.p;
      g.mustRemove = false;
      endTurn(g);
      return null;
    }

    if (a.type === 'place') {
      if (phase(g, color) !== 'place') return 'Alle Steine sind gesetzt – jetzt wird gezogen.';
      if (!ok(a.p) || g.board[a.p] !== 0) return 'Dieser Punkt ist belegt.';
      g.board[a.p] = color;
      g.inHand[color]--;
      g.onBoard[color]++;
      g.last = { to: a.p };
      afterLanding(g, a.p);
      return null;
    }

    if (a.type === 'move') {
      if (phase(g, color) === 'place') return 'Erst alle Steine setzen.';
      if (!ok(a.from) || !ok(a.to) || g.board[a.from] !== color) return 'Das ist nicht dein Stein.';
      if (!targets(g, a.from).includes(a.to)) return 'Dorthin kann der Stein nicht ziehen.';
      g.board[a.from] = 0;
      g.board[a.to] = color;
      g.last = { from: a.from, to: a.to };
      afterLanding(g, a.to);
      return null;
    }
    return 'Unbekannte Aktion.';
  }

  const R = { POINTS, MILLS, ADJ, PIECES, newGame, phase, millAt, removable, targets, hasMove, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else root.Muehle = R;
})(this);
