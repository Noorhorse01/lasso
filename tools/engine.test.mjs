// Checks the engine's rules against hand-built boards. Run: node tools/engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const block = html.match(/\/\* ===== ENGINE:BEGIN[\s\S]*?\/\* ===== ENGINE:END ===== \*\//);
assert.ok(block, 'engine block present');
const engineCode = block[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.ok(!/\b(document|window|Math\.random|Date|localStorage)\b/.test(engineCode), 'engine touches no DOM, clock or Math.random');
const L = new Function(block[0] + '\nreturn LassoEngine;')();
const { H, V, NE, ES, SW, WN, NES, ESW, SWN, WNE } = L.SHAPES;
const at = (r, c) => r * 9 + c;

// A game on an empty board with a chosen hand. Junk drops switched off so boards stay exact.
function blank(hand) {
  const g = L.newGame(1, Object.assign({}, L.DEFAULT_RULES, { startJunk: 0, junkEvery: 0 }));
  g.hand = hand.concat([0, 0, 0]).slice(0, 3);
  g.over = false;
  return g;
}
function lay(g, list) { for (const [r, c, v] of list) g.board[at(r, c)] = v; }

const tests = {
  'matching ends connect, clashing ends are refused'() {
    const g = blank([H]);
    lay(g, [[4, 4, H]]);
    assert.equal(L.canPlace(g, H, at(4, 5)), true, 'east end meets west end');
    assert.equal(L.canPlace(g, V, at(4, 5)), false, 'solid side against a rope end');
    assert.equal(L.canPlace(g, V, at(3, 4)), false, 'rope end against a solid side');
    assert.equal(L.canPlace(g, H, at(3, 4)), true, 'two solid sides may touch');
    assert.equal(L.canPlace(g, H, at(4, 4)), false, 'occupied');
  },
  'ends may face walls and junk'() {
    const g = blank([V]);
    g.board[at(4, 5)] = L.JUNK;
    assert.equal(L.canPlace(g, V, at(0, 0)), true, 'north end off the board');
    assert.equal(L.canPlace(g, H, at(4, 4)), true, 'east end into a burr');
  },
  'smallest loop clears and scores'() {
    const g = blank([WN]);
    lay(g, [[3, 3, ES], [3, 4, SW], [4, 3, NE]]);
    const ev = L.place(g, 0, at(4, 4));
    assert.deepEqual(ev.loop, [at(3, 3), at(3, 4), at(4, 3), at(4, 4)]);
    assert.deepEqual(ev.enclosed, []);
    assert.equal(ev.points, 5 * 4 * 4);
    assert.equal(g.score, 80);
    assert.equal(g.board.filter(Boolean).length, 0);
  },
  'ring clears everything inside, burrs score extra'() {
    const g = blank([WN]);
    lay(g, [
      [2, 2, ES], [2, 3, H], [2, 4, H], [2, 5, SW],
      [3, 2, V], [3, 5, V],
      [4, 2, V], [4, 5, V],
      [5, 2, NE], [5, 3, H], [5, 4, H],
      [3, 3, L.JUNK], [4, 4, ES],
      [7, 7, L.JUNK],
    ]);
    const ev = L.place(g, 0, at(5, 5));
    assert.equal(ev.loop.length, 12);
    assert.deepEqual(ev.enclosed.sort((a, b) => a - b), [at(3, 3), at(3, 4), at(4, 3), at(4, 4)]);
    assert.equal(ev.junk, 1);
    assert.equal(ev.points, 5 * 16 * 16 + 20);
    assert.equal(g.board[at(7, 7)], L.JUNK, 'outside burr stays');
    assert.equal(g.board.filter(Boolean).length, 1);
  },
  'a pocket that reaches the outside only through a corner is not enclosed'() {
    // A thin loop bent into a C. The burr at (3,3) has rope on all four sides,
    // but (4,4) touches it diagonally and is open to the rest of the board.
    const g = blank([H]);
    lay(g, [
      [1, 1, ES], [1, 2, H], [1, 4, H], [1, 5, SW],
      [2, 1, V], [2, 2, ES], [2, 3, H], [2, 4, SW], [2, 5, V],
      [3, 1, V], [3, 2, V], [3, 3, L.JUNK], [3, 4, NE], [3, 5, WN],
      [4, 1, V], [4, 2, NE], [4, 3, SW],
      [5, 1, NE], [5, 2, H], [5, 3, WN],
    ]);
    const ev = L.place(g, 0, at(1, 3));
    assert.equal(ev.loop.length, 20);
    assert.deepEqual(ev.enclosed, []);
    assert.equal(g.board[at(3, 3)], L.JUNK, 'burr stays');
  },
  'a side branch outside the loop survives, one inside goes'() {
    const g = blank([WN]);
    lay(g, [
      [2, 2, ES], [2, 3, H], [2, 4, SW],
      [3, 2, NES], [3, 4, V],
      [4, 2, NE], [4, 3, H],
    ]);
    // The fork's spare end points east into the middle of the ring.
    const ev = L.place(g, 0, at(4, 4));
    assert.equal(ev.loop.length, 8);
    assert.deepEqual(ev.enclosed, [at(3, 3)]);

    const h = blank([WN]);
    lay(h, [
      [2, 2, ES], [2, 3, H], [2, 4, SW],
      [3, 2, SWN], [3, 4, V],
      [4, 2, NE], [4, 3, H],
      [3, 1, H], [3, 0, H],
    ]);
    const ev2 = L.place(h, 0, at(4, 4));
    assert.equal(ev2.loop.length, 8);
    assert.equal(h.board[at(3, 1)], H, 'outside branch stays');
    assert.equal(h.board[at(3, 0)], H);
  },
  'one tile closing two loops clears both'() {
    const g = blank([WNE]);
    lay(g, [
      // Two 2x2 loops side by side, sharing the column the fork goes in.
      [3, 3, ES], [3, 4, ESW], [3, 5, SW],
      [4, 3, NE], [4, 5, WN],
    ]);
    const ev = L.place(g, 0, at(4, 4));
    assert.equal(ev.loop.length, 6);
    assert.equal(ev.points, 5 * 6 * 6);
    assert.equal(g.board.filter(Boolean).length, 0);
  },
  'new hand only after all three are placed, game over when nothing fits'() {
    const g = blank([H, V, H]);
    assert.equal(L.place(g, 0, at(0, 0)).newHand, false);
    assert.equal(L.place(g, 1, at(5, 5)).newHand, false);
    const ev = L.place(g, 2, at(8, 8));
    assert.equal(ev.newHand, true);
    assert.ok(g.hand.every(Boolean));

    const full = blank([H]);
    for (let i = 0; i < L.CELLS; i++) full.board[i] = L.JUNK;
    full.board[at(4, 4)] = 0;
    full.board[at(4, 5)] = V;
    full.hand = [H, 0, 0];
    full.over = false;
    assert.equal(L.legalCells(full, H).length, 0);
    full.board[at(4, 5)] = L.JUNK;
    assert.equal(L.legalCells(full, H).length, 1);
    const ev2 = (() => { full.hand = [H, 0, 0]; return L.place(full, 0, at(4, 4)); })();
    assert.equal(ev2.over, true, 'board full, fresh hand has no room');
    assert.equal(full.over, true);
    assert.equal(L.place(full, 0, at(0, 0)), null, 'no moves after game over');
  },
  'same date gives the same board and tiles, different dates differ'() {
    const a = L.newGame(L.seedForDate('2026-11-10'));
    const b = L.newGame(L.seedForDate('2026-11-10'));
    const c = L.newGame(L.seedForDate('2026-11-11'));
    assert.deepEqual(a.board, b.board);
    assert.deepEqual(a.hand, b.hand);
    assert.deepEqual(a.bag, b.bag);
    assert.notDeepEqual([a.board, a.hand, a.bag], [c.board, c.hand, c.bag]);
  },
  'tile order does not depend on how you play'() {
    const a = L.newGame(77), b = L.newGame(77);
    const seqA = [], seqB = [];
    const run = (g, seq, pick) => {
      for (let n = 0; n < 45 && !g.over; n++) {
        if (g.placed % 3 === 0) seq.push(g.hand.join());
        const h = g.hand.findIndex(Boolean);
        const cells = L.legalCells(g, g.hand[h]);
        if (!cells.length) { const alt = g.hand.findIndex((s) => s && L.legalCells(g, s).length); if (alt < 0) break; L.place(g, alt, L.legalCells(g, g.hand[alt])[0]); continue; }
        L.place(g, h, cells[pick(cells.length)]);
      }
    };
    run(a, seqA, () => 0);
    run(b, seqB, (n) => n - 1);
    const shared = Math.min(seqA.length, seqB.length);
    assert.ok(shared >= 5, 'enough hands compared');
    assert.deepEqual(seqA.slice(0, shared), seqB.slice(0, shared));
  },
  'matches the published test vectors in docs/rules.md'() {
    const names = Object.fromEntries(Object.entries(L.SHAPES).map(([k, v]) => [v, k]));
    const cases = [
      ['2026-11-10', 3580070051, [16, 41, 59, 64, 66, 74], 'SW SW V', 'SW ESW ES ES WNE ESW NES NE H', 86, 920, 5],
      ['2027-01-01', 1093525321, [1, 25, 38, 51, 59, 62], 'NE WNE NES', 'WN SW SW NE WN ES SWN V WN', 71, 180, 1],
    ];
    for (const [date, seed, junk, hand, next, placed, score, loops] of cases) {
      assert.equal(L.seedForDate(date), seed);
      const g = L.newGame(seed);
      assert.deepEqual(g.board.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), junk);
      assert.equal(g.hand.map((v) => names[v]).join(' '), hand);
      assert.equal(g.bag.slice(0, 9).map((v) => names[v]).join(' '), next);
      while (!g.over) {
        const h = [0, 1, 2].find((i) => g.hand[i] && L.legalCells(g, g.hand[i]).length);
        L.place(g, h, L.legalCells(g, g.hand[h])[0]);
      }
      assert.deepEqual([g.placed, g.score, g.loops.length], [placed, score, loops]);
    }
  },
  'closing loops in consecutive hands builds a chain that multiplies points'() {
    const g = blank([WN, H, H]);
    const ring = (r, c) => lay(g, [[r, c, ES], [r, c + 1, SW], [r + 1, c, NE]]);
    ring(3, 3);
    assert.equal(L.chainMultiplier(g), 1);
    let ev = L.place(g, 0, at(4, 4));
    assert.deepEqual([ev.points, ev.multiplier, ev.chain], [80, 1, 1]);
    L.place(g, 1, at(0, 0));
    L.place(g, 2, at(0, 2));
    assert.equal(g.chain, 1, 'chain survives into the next hand');
    assert.equal(g.handLooped, false);
    assert.equal(L.chainMultiplier(g), 2);

    g.hand = [WN, H, H];
    ring(6, 6);
    ev = L.place(g, 0, at(7, 7));
    assert.deepEqual([ev.points, ev.multiplier, ev.chain], [160, 2, 2]);
    assert.equal(g.score, 240);
    L.place(g, 1, at(8, 0));
    L.place(g, 2, at(8, 2));

    g.hand = [H, H, H];
    assert.equal(L.chainMultiplier(g), 3);
    L.place(g, 0, at(8, 4));
    L.place(g, 1, at(8, 6));
    L.place(g, 2, at(8, 8));
    assert.equal(g.chain, 0, 'a hand with no loop ends the chain');
    assert.equal(L.chainMultiplier(g), 1);
    assert.equal(L.longestChain(g), 2);
  },
  'two loops in one hand share a multiplier and count once'() {
    const g = blank([WN, WN, H]);
    g.chain = 1;
    lay(g, [[1, 1, ES], [1, 2, SW], [2, 1, NE], [5, 5, ES], [5, 6, SW], [6, 5, NE]]);
    const a = L.place(g, 0, at(2, 2));
    const b = L.place(g, 1, at(6, 6));
    assert.deepEqual([a.points, a.multiplier], [160, 2]);
    assert.deepEqual([b.points, b.multiplier], [160, 2]);
    assert.equal(g.chain, 2);
  },
  'the multiplier stops at the cap, and preview always matches the real points'() {
    const g = blank([WN, H, H]);
    g.chain = 7;
    lay(g, [[3, 3, ES], [3, 4, SW], [4, 3, NE]]);
    assert.equal(L.chainMultiplier(g), 5);
    const p = L.preview(g, WN, at(4, 4));
    const ev = L.place(g, 0, at(4, 4));
    assert.equal(p.points, 400);
    assert.equal(ev.points, p.points);
    assert.equal(g.chain, 8, 'the chain itself keeps counting');
  },
  'a run saved before chains existed still loads'() {
    const old = L.serialize(L.newGame(9));
    delete old.chain; delete old.handLooped;
    const g = L.restore(JSON.parse(JSON.stringify(old)));
    assert.deepEqual([g.chain, g.handLooped, L.chainMultiplier(g)], [0, false, 1]);
  },
  'matches the chain playout in docs/rules.md'() {
    const cases = [
      ['2026-11-10', 86, 560, 6, 2, [1, 2, 1, 1, 1, 1]],
      ['2027-01-01', 82, 480, 3, 1, [1, 1, 1]],
    ];
    for (const [date, placed, score, loops, chain, multipliers] of cases) {
      const g = L.newGame(L.seedForDate(date));
      while (!g.over) {
        let best = null, value = -1;
        for (let h = 0; h < 3; h++) {
          if (!g.hand[h]) continue;
          for (const c of L.legalCells(g, g.hand[h])) {
            let links = 0;
            for (const d of L.DIRS) {
              const n = L.neighbor(c, d);
              if ((g.hand[h] & d.bit) && n >= 0 && L.isTile(g.board[n]) && (g.board[n] & d.opp)) links++;
            }
            const v = L.preview(g, g.hand[h], c).loop.length ? 100 : links;
            if (v > value) { value = v; best = [h, c]; }
          }
        }
        L.place(g, best[0], best[1]);
      }
      assert.deepEqual([g.placed, g.score, g.loops.length, L.longestChain(g)], [placed, score, loops, chain]);
      assert.deepEqual(g.loops.map((l) => l.multiplier), multipliers);
    }
  },
  'share text gives no positions'() {
    const g = blank([WN]);
    lay(g, [[3, 3, ES], [3, 4, SW], [4, 3, NE]]);
    L.place(g, 0, at(4, 4));
    const t = L.shareText(g, '2026-11-10');
    assert.equal(t, 'Lasso 2026-11-10\n80 points, 1 loop, biggest 4\n🟡');
    g.loops.push({ cells: 8, enclosed: 1, junk: 0, points: 810, chain: 2, multiplier: 2 });
    assert.equal(L.shareText(g, '2026-11-10').split('\n')[1], '80 points, 2 loops, biggest 9, chain 2');
  },
  'a saved game plays on identically'() {
    const a = L.newGame(4242);
    const b = L.restore(JSON.parse(JSON.stringify(L.serialize(a))));
    for (let n = 0; n < 12; n++) {
      const h = a.hand.findIndex(Boolean);
      const cell = L.legalCells(a, a.hand[h])[0];
      L.place(a, h, cell); L.place(b, h, cell);
    }
    assert.deepEqual(a.board, b.board);
    assert.deepEqual(a.hand, b.hand);
    assert.equal(a.score, b.score);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
