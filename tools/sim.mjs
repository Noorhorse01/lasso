// Plays Lasso with bots to tune the tile mix. Runs the engine straight out of index.html.
// Usage: node tools/sim.mjs [games]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const match = html.match(/\/\* ===== ENGINE:BEGIN[\s\S]*?\/\* ===== ENGINE:END ===== \*\//);
if (!match) throw new Error('engine block not found in index.html');
export const Engine = new Function(match[0] + '\nreturn LassoEngine;')();

const MAX_TILES = 3000;

function makeRand(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Counts how many sides of the cell are satisfied or left dangling.
function shapeStats(game, shape, cell) {
  let links = 0, openToEmpty = 0, wall = 0;
  for (const d of Engine.DIRS) {
    if (!(shape & d.bit)) continue;
    const n = Engine.neighbor(cell, d);
    if (n < 0) { wall++; continue; }
    const v = game.board[n];
    if (v === 0) openToEmpty++;
    else if (Engine.isTile(v) && (v & d.opp)) links++;
    else wall++;
  }
  return { links, openToEmpty, wall };
}

function moves(game) {
  const out = [];
  game.hand.forEach((shape, h) => {
    if (!shape) return;
    for (const cell of Engine.legalCells(game, shape)) out.push({ h, cell, shape });
  });
  return out;
}

// Cost of leaving a track: how close together its open ends are after this move.
function trackGap(game, cell) {
  const seen = new Set([cell]);
  const stack = [cell];
  const targets = [];
  while (stack.length) {
    const at = stack.pop();
    const v = game.board[at];
    for (const d of Engine.DIRS) {
      if (!(v & d.bit)) continue;
      const n = Engine.neighbor(at, d);
      if (n < 0 || game.board[n] === Engine.JUNK) continue;
      if (game.board[n] === 0) targets.push(n);
      else if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  let best = 99;
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    const dist = Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs((a % 9) - (b % 9));
    if (dist < best) best = dist;
  }
  return { gap: best, size: seen.size };
}

// Does placing here leave a neighboring empty cell that no tile in the set could ever fill?
function deadCells(game, cell, shapes) {
  let dead = 0;
  for (const d of Engine.DIRS) {
    const n = Engine.neighbor(cell, d);
    if (n < 0 || game.board[n] !== 0) continue;
    if (!shapes.some((s) => Engine.canPlace(game, s, n))) dead++;
  }
  return dead;
}

function planValue(game, m, shapes, rand, noise) {
  const st = shapeStats(game, m.shape, m.cell);
  game.board[m.cell] = m.shape;
  const { gap, size } = trackGap(game, m.cell);
  const dead = deadCells(game, m.cell, shapes);
  game.board[m.cell] = 0;
  let v = rand() * noise + st.links * 3 - st.wall * 2 - dead * 4;
  if (gap < 99) v += (14 - gap) * 1.5 + Math.min(size, 10) * 0.5;
  return v;
}

function bagShapes(game) {
  return Object.keys(Engine.SHAPES).filter((k) => game.rules.bag[k] > 0).map((k) => Engine.SHAPES[k]);
}

const bots = {
  // Takes any legal move at all. A lower bound, not a person.
  random(game, rand) {
    const m = moves(game);
    return m[Math.floor(rand() * m.length)];
  },
  // A kid who has the idea: tries to bring rope ends together, misses a closing move one time in four.
  casual(game, rand) {
    const shapes = bagShapes(game);
    let best = null, bestValue = -Infinity;
    for (const m of moves(game)) {
      const p = Engine.preview(game, m.shape, m.cell);
      let v = planValue(game, m, shapes, rand, 8);
      if (p.loop.length && rand() < 0.75) v += 100 + p.points / 10;
      if (v > bestValue) { bestValue = v; best = m; }
    }
    return best;
  },
  // Holds out for loops with something inside, until the board gets crowded.
  stretcher(game, rand) {
    const shapes = bagShapes(game);
    const filled = game.board.filter((v) => v !== 0).length / Engine.CELLS;
    const minEnclosed = filled > 0.6 ? 0 : 4;
    let best = null, bestValue = -Infinity;
    for (const m of moves(game)) {
      const p = Engine.preview(game, m.shape, m.cell);
      const st = shapeStats(game, m.shape, m.cell);
      game.board[m.cell] = m.shape;
      const { gap, size } = trackGap(game, m.cell);
      const dead = deadCells(game, m.cell, shapes);
      game.board[m.cell] = 0;
      let v = rand() + st.links * 3 - st.wall * 2 - dead * 4 + Math.min(size, 24);
      if (gap < 99 && size >= 12) v -= gap * 2;
      if (p.loop.length) v += p.enclosed.length >= minEnclosed ? 1000 + p.points : -500;
      if (v > bestValue) { bestValue = v; best = m; }
    }
    return best;
  },
  // Always closes when it can and takes the biggest closure, otherwise builds tidily.
  careful(game, rand) {
    const shapes = bagShapes(game);
    let best = null, bestValue = -Infinity;
    for (const m of moves(game)) {
      const p = Engine.preview(game, m.shape, m.cell);
      let v = planValue(game, m, shapes, rand, 1);
      if (p.loop.length) v += 1000 + p.points;
      if (v > bestValue) { bestValue = v; best = m; }
    }
    return best;
  },
};

// Builds one planned rectangle at a time. The closest thing here to a player chasing a big score.
const ringPlans = new WeakMap();
function ringSlots(top, left, size) {
  const { N, E, S, W } = Engine;
  const slots = new Map();
  const last = size - 1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (r !== 0 && r !== last && c !== 0 && c !== last) continue;
    let need;
    if (r === 0 && c === 0) need = E | S;
    else if (r === 0 && c === last) need = S | W;
    else if (r === last && c === 0) need = N | E;
    else if (r === last && c === last) need = N | W;
    else if (r === 0 || r === last) need = E | W;
    else need = N | S;
    slots.set((top + r) * 9 + left + c, need);
  }
  return slots;
}
function pickRing(game, size) {
  let best = null, bestValue = -1;
  for (let top = 0; top + size <= 9; top++) for (let left = 0; left + size <= 9; left++) {
    const slots = ringSlots(top, left, size);
    let ok = true, have = 0;
    for (const [cell, need] of slots) {
      const v = game.board[cell];
      if (v === 0) continue;
      if (v === Engine.JUNK || (v & need) !== need) { ok = false; break; }
      have++;
    }
    if (ok && have >= bestValue) { bestValue = have; best = slots; }
  }
  return best;
}
function ringBot(game, rand, size) {
  let slots = ringPlans.get(game);
  const stillGood = slots && [...slots].every(([cell, need]) => {
    const v = game.board[cell];
    return v !== Engine.JUNK && (v === 0 || (v & need) === need);
  });
  if (!stillGood) { slots = pickRing(game, size); ringPlans.set(game, slots); }
  const shapes = bagShapes(game);
  let best = null, bestValue = -Infinity;
  for (const m of moves(game)) {
    const p = Engine.preview(game, m.shape, m.cell);
    let v = rand();
    if (slots && slots.has(m.cell)) {
      const need = slots.get(m.cell);
      if ((m.shape & need) === need) v += m.shape === need ? 500 : 300;
      else v -= 800;
    } else {
      const nearRing = slots && Engine.DIRS.some((d) => {
        const n = Engine.neighbor(m.cell, d);
        return n >= 0 && slots.has(n);
      });
      if (nearRing) v -= 300;
      v += planValue(game, m, shapes, rand, 1) * 0.2;
    }
    if (p.loop.length) v += (slots && slots.has(m.cell)) ? 2000 + p.points : 600 + p.points;
    if (v > bestValue) { bestValue = v; best = m; }
  }
  return best;
}
bots.ring3 = (g, r) => ringBot(g, r, 3);
bots.ring4 = (g, r) => ringBot(g, r, 4);
bots.ring5 = (g, r) => ringBot(g, r, 5);

function play(botName, seed, rules) {
  const game = Engine.newGame(seed, rules);
  const rand = makeRand(seed ^ 0x51ed270b);
  const bot = bots[botName];
  while (!game.over && game.placed < MAX_TILES) {
    const m = bot(game, rand);
    Engine.place(game, m.h, m.cell);
  }
  return game;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function summarize(botName, rules, count) {
  const tiles = [], scores = [], loops = [], gaps = [], areas = [], enclosed = [];
  let noLoop = 0, capped = 0;
  const firstLoop = [], longestChains = [];
  let loopsAll = 0, loopsChained = 0;
  for (let i = 0; i < count; i++) {
    const g = play(botName, 1000 + i * 7919, rules);
    if (g.placed >= MAX_TILES) capped++;
    tiles.push(g.placed);
    scores.push(g.score);
    loops.push(g.loops.length);
    if (g.loops.length === 0) noLoop++;
    if (g.loops.length) gaps.push(g.placed / g.loops.length);
    if (g.loops.length) firstLoop.push(g.loops[0].atTile);
    let longest = 0;
    for (const l of g.loops) {
      areas.push(l.cells + l.enclosed); enclosed.push(l.enclosed);
      loopsAll++;
      if ((l.multiplier || 1) >= 2) loopsChained++;
      longest = Math.max(longest, l.chain || 0);
    }
    longestChains.push(longest);
  }
  for (const a of [tiles, scores, loops, gaps, areas, enclosed, firstLoop, longestChains]) a.sort((x, y) => x - y);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  return {
    bot: botName,
    tilesP10: percentile(tiles, 0.1), tilesMed: percentile(tiles, 0.5), tilesP90: percentile(tiles, 0.9),
    loopsMed: percentile(loops, 0.5),
    tilesPerLoop: +avg(gaps).toFixed(1),
    noLoopPct: +(100 * noLoop / count).toFixed(1),
    avgLoopSize: +avg(areas).toFixed(1),
    bigLoopPct: +(100 * enclosed.filter((e) => e >= 1).length / Math.max(1, enclosed.length)).toFixed(1),
    scoreP10: percentile(scores, 0.1), scoreMed: percentile(scores, 0.5), scoreP90: percentile(scores, 0.9),
    firstLoopP10: percentile(firstLoop, 0.1), firstLoopMed: percentile(firstLoop, 0.5), firstLoopP90: percentile(firstLoop, 0.9),
    chainedPct: +(100 * loopsChained / Math.max(1, loopsAll)).toFixed(1),
    longestChainMed: percentile(longestChains, 0.5), longestChainP90: percentile(longestChains, 0.9),
    cappedPct: +(100 * capped / count).toFixed(1),
  };
}

export function report(label, rules, count) {
  console.log('\n## ' + label);
  console.log(['bot', 'tiles p10/med/p90', 'loops', 'tiles/loop', 'firstLoop p10/med/p90', 'noLoop%', 'avgSize', 'big%', 'chained%', 'chain med/p90', 'score p10/med/p90', 'capped%'].join(' | '));
  for (const b of Object.keys(bots)) {
    const s = summarize(b, rules, count);
    console.log([s.bot, `${s.tilesP10}/${s.tilesMed}/${s.tilesP90}`, s.loopsMed, s.tilesPerLoop, `${s.firstLoopP10}/${s.firstLoopMed}/${s.firstLoopP90}`, s.noLoopPct, s.avgLoopSize, s.bigLoopPct, s.chainedPct, `${s.longestChainMed}/${s.longestChainP90}`, `${s.scoreP10}/${s.scoreMed}/${s.scoreP90}`, s.cappedPct].join(' | '));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  report('shipping rules', Engine.DEFAULT_RULES, Number(process.argv[2] || 300));
}
