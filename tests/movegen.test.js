// Run: node tests/movegen.test.js
// Loads the ChessLogic block straight out of index.html and checks move generation.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script id="chess-logic">([\s\S]*?)<\/script>/)[1];
const L = new Function(code + '\nreturn ChessLogic;')();

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const sq = L.sqIndex;
const find = (s, from, to, extra = {}) => L.legalMoves(s).find(m =>
  m.from === sq(from) && m.to === sq(to) && Object.keys(extra).every(k => m[k] === extra[k]));
const at = (s, name) => { const p = s.board[sq(name)]; return p ? (p.c === 'w' ? p.t : p.t.toLowerCase()) : null; };

console.log('Move generation tests');

test('starting position has 20 legal moves for White', () => {
  assert.strictEqual(L.legalMoves(L.initialState()).length, 20);
});

test('perft from start: depth 2 = 400, depth 3 = 8902', () => {
  const s = L.initialState();
  assert.strictEqual(L.perft(s, 2), 400);
  assert.strictEqual(L.perft(s, 3), 8902);
});

test('perft "Kiwipete" (castling, en passant, promotions): d1=48, d2=2039, d3=97862', () => {
  const s = L.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.strictEqual(L.perft(s, 1), 48);
  assert.strictEqual(L.perft(s, 2), 2039);
  assert.strictEqual(L.perft(s, 3), 97862);
});

test('perft position 3 (en passant pins): d4 = 43238', () => {
  assert.strictEqual(L.perft(L.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 4), 43238);
});

test('perft position 4 (promotions, checks): d3 = 9467', () => {
  assert.strictEqual(L.perft(L.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 3), 9467);
});

test('castling both sides for White moves king and rook', () => {
  const s = L.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const ks = find(s, 'e1', 'g1', { castle: 'K' });
  const qs = find(s, 'e1', 'c1', { castle: 'Q' });
  assert.ok(ks && qs, 'both castling moves available');
  const a = L.makeMove(s, ks);
  assert.deepStrictEqual([at(a, 'g1'), at(a, 'f1'), at(a, 'h1'), at(a, 'e1')], ['K', 'R', null, null]);
  assert.ok(!a.castling.wK && !a.castling.wQ && a.castling.bK);
  const b = L.makeMove(s, qs);
  assert.deepStrictEqual([at(b, 'c1'), at(b, 'd1'), at(b, 'a1')], ['K', 'R', null]);
  assert.strictEqual(L.toSAN(s, ks), 'O-O');
  assert.strictEqual(L.toSAN(s, qs), 'O-O-O');
});

test('castling forbidden when in check, through an attacked square, or blocked', () => {
  const inCheck = L.fromFEN('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!find(inCheck, 'e1', 'g1') && !find(inCheck, 'e1', 'c1'));
  const through = L.fromFEN('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1');       // f1 attacked
  assert.ok(!find(through, 'e1', 'g1') && find(through, 'e1', 'c1'));
  const blocked = L.fromFEN('6k1/8/8/8/8/8/8/RN2K2R w KQ - 0 1');      // b1 occupied
  assert.ok(find(blocked, 'e1', 'g1') && !find(blocked, 'e1', 'c1'));
});

test('castling right lost after rook moves or is captured', () => {
  let s = L.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  s = L.makeMove(s, find(s, 'h1', 'h8'));    // rook takes rook: both sides lose kingside right
  assert.ok(!s.castling.wK && !s.castling.bK && s.castling.wQ && s.castling.bQ);
});

test('en passant: capture available right after double step, removes pawn', () => {
  let s = L.fromFEN('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
  s = L.makeMove(s, find(s, 'd7', 'd5', { double: true }));
  assert.strictEqual(L.sqName(s.ep), 'd6');
  const ep = find(s, 'e5', 'd6', { enPassant: true });
  assert.ok(ep, 'en passant move generated');
  assert.strictEqual(L.toSAN(s, ep), 'exd6');
  const after = L.makeMove(s, ep);
  assert.deepStrictEqual([at(after, 'd6'), at(after, 'd5'), at(after, 'e5')], ['P', null, null]);
});

test('en passant only on the very next move', () => {
  let s = L.fromFEN('4k3/3p4/8/4P3/8/8/8/K7 b - - 0 1');
  s = L.makeMove(s, find(s, 'd7', 'd5'));
  s = L.makeMove(s, find(s, 'a1', 'a2'));
  s = L.makeMove(s, find(s, 'e8', 'e7'));
  assert.ok(!find(s, 'e5', 'd6'));
});

test('en passant illegal if it exposes own king (horizontal pin)', () => {
  const s = L.fromFEN('8/8/8/K2Pp2r/8/8/8/7k w - e6 0 1');
  assert.ok(!find(s, 'd5', 'e6'));
});

test('promotion offers four pieces and promotes', () => {
  const s = L.fromFEN('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
  const promos = L.legalMoves(s).filter(m => m.from === sq('e7'));
  assert.deepStrictEqual(promos.map(m => m.promo).sort(), ['B', 'N', 'Q', 'R']);
  const after = L.makeMove(s, promos.find(m => m.promo === 'N'));
  assert.strictEqual(at(after, 'e8'), 'N');
});

test("checkmate detected (fool's mate)", () => {
  let s = L.initialState();
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) s = L.makeMove(s, find(s, f, t));
  const mate = find(s, 'd8', 'h4');
  assert.strictEqual(L.toSAN(s, mate), 'Qh4#');
  const st = L.gameStatus(L.makeMove(s, mate));
  assert.strictEqual(st.reason, 'checkmate');
  assert.strictEqual(st.winner, 'b');
});

test('stalemate detected', () => {
  const st = L.gameStatus(L.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'));
  assert.strictEqual(st.reason, 'stalemate');
});

test('insufficient material and threefold repetition', () => {
  assert.strictEqual(L.gameStatus(L.fromFEN('8/8/8/4k3/8/8/2B5/4K3 w - - 0 1')).reason, 'insufficient material');
  let s = L.initialState();
  const keys = [L.positionKey(s)];
  for (let i = 0; i < 2; i++) {
    for (const [f, t] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) {
      s = L.makeMove(s, find(s, f, t)); keys.push(L.positionKey(s));
    }
  }
  assert.strictEqual(L.gameStatus(s, keys).reason, 'threefold repetition');
});

test('SAN disambiguation', () => {
  const s = L.fromFEN('4k3/8/8/8/8/8/8/R4RK1 w - - 0 1');
  assert.strictEqual(L.toSAN(s, find(s, 'a1', 'd1')), 'Rad1');
  const t = L.fromFEN('4k3/8/8/R7/8/8/8/R5K1 w - - 0 1');
  assert.strictEqual(L.toSAN(t, find(t, 'a1', 'a3')), 'R1a3');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ', all OK'}`);
