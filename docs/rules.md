# Lasso rules (the spec for any port)

The reference code is the block between `ENGINE:BEGIN` and `ENGINE:END` in `index.html`. It has no DOM, clock or `Math.random`. If this file and that code ever disagree, the code wins. A port should reproduce the test vectors at the end exactly.

## Board

- 9 by 9 cells. A cell index is `row * 9 + column`, with row 0 at the top and column 0 at the left.
- Each cell is empty (`0`), a tile (its mask, 1 to 15) or junk (`16`, shown as a burr).

## Tiles

A tile is a 4-bit mask of the sides its rope leaves through: `N = 1`, `E = 2`, `S = 4`, `W = 8`. Tiles never rotate.

| Name | Mask | Sides | Copies per bag |
|---|---|---|---|
| H | 10 | E W | 2 |
| V | 5 | N S | 2 |
| NE | 3 | N E | 3 |
| ES | 6 | E S | 3 |
| SW | 12 | S W | 3 |
| WN | 9 | W N | 3 |
| NES | 7 | N E S | 2 |
| ESW | 14 | E S W | 2 |
| SWN | 13 | S W N | 2 |
| WNE | 11 | W N E | 2 |

A bag holds 24 tiles, built in the table's order and then shuffled (see Randomness).

## Placement

A tile may go on a cell when:

1. The cell is empty.
2. For each side facing another **tile**, this tile's side and the neighbor's facing side are either both rope or both solid.

Sides facing an empty cell, junk or the edge of the board never clash. A rope end may point at a wall or junk, where it can never connect.

## Hand

- Three tiles are drawn from the bag. They may be placed in any order.
- A new hand is dealt only when all three have been placed.

## Loops

Two neighboring tiles are linked when both have rope on their shared side. Links form a graph over tiles.

After a tile is placed on cell P:

1. Before each placement the graph has no cycles, because every cycle is removed as soon as it forms. So any new cycle runs through P.
2. List P's linked neighbors. For each pair that are still connected to each other with P removed, the tree path between them, plus P, is part of the loop.
3. The **loop** is the union of all those paths and P. One placement can close more than one cycle, and they all clear together.
4. The **enclosed** cells are every non-loop cell that cannot be reached from the board's outer ring by stepping in any of the 8 directions through non-loop cells. Use 8 directions, not 4: a pocket joined to the outside only at a corner is outside.

If there is a loop, all loop cells and enclosed cells become empty, whatever they held. Rope branching off the loop on the outside stays.

## Scoring

```
area   = loop cells + enclosed cells
points = (5 * area * area + 20 * (junk cells enclosed)) * multiplier
```

`multiplier` comes from the chain, below. It is 1 unless you are on one. The table shows points at multiplier 1.

| Shape | Area | Points |
|---|---|---|
| 2x2 ring | 4 | 80 |
| 3x3 ring | 9 | 405 |
| 4x4 ring | 16 | 1,280 |
| 5x5 ring | 25 | 3,125 |

## Chains

A game tracks `chain` (starts at 0) and `handLooped` (starts false).

- The multiplier for a loop closed now is `min(handLooped ? chain : chain + 1, 5)`.
- Closing a loop when `handLooped` is false adds 1 to `chain` and sets `handLooped` to true. Further loops in that hand use the same multiplier and add nothing.
- When a hand is finished: if `handLooped` is false, set `chain` to 0. Then set `handLooped` to false.

So the first hand with a loop scores ×1, the next consecutive one ×2, then ×3, up to ×5. A hand with no loop ends the chain. `chain` itself keeps counting past 5, and the longest one is reported at the end of a run. Chains only change points. They don't affect tiles, junk or when a run ends.

## Order of events when a tile is placed

1. Put the tile on the board and remove it from the hand.
2. Find the loop and enclosed cells, clear them, add the points using the multiplier, then update the chain.
3. If the hand is now empty: finish the chain for that hand. If `hands dealt so far` is divisible by 2, drop one junk (see below). Then deal a new hand and add 1 to `hands dealt`.
4. The run is over if no tile left in the hand has a legal cell.

## Junk

- A new game places 6 junk. For each, draw `cell = next(junk stream) % 81`, and if that cell is already taken, draw again until 6 are placed.
- A later junk drop draws once. If that cell is occupied, nothing drops. This keeps the positions the same for everyone, and gives a little mercy when the board is crowded.

## Randomness

All arithmetic is 32-bit and wraps. In Swift use `&+`, `&*` and `UInt32`.

**Hash** (FNV-1a over the bytes of the text):

```
h = 0x811C9DC5
for each byte b:  h = (h XOR b) * 0x01000193
```

**Random stream** (mulberry32). State `s` is a 32-bit integer:

```
s = s + 0x6D2B79F5
t = (s XOR (s >> 15)) * (s OR 1)
t = (t + ((t XOR (t >> 7)) * (t OR 61))) XOR t
return t XOR (t >> 14)
```

`>>` is an unsigned shift. Multiplication keeps the low 32 bits.

**Seeds.** A game has two independent streams:

```
tile stream state = seed
junk stream state = seed XOR 0x9E3779B9
```

**Bag.** Build the 24 tiles in table order, then for `i` from 23 down to 1: `j = next(tile stream) % (i + 1)`, swap items `i` and `j`. Tiles are then drawn from index 0 upward. When the bag is empty, build and shuffle a new one.

Order at start of game: place the 6 junk, then deal the first hand. The tile order never depends on how the player plays.

## Modes

- **Daily:** `seed = hash("lasso-" + date)`, where `date` is the player's local date as `YYYY-MM-DD`. One attempt per day, saved so a reload resumes it. A run in progress keeps its date until it ends.
- **Free play:** a random 32-bit seed. Best score is saved on the device.

Personal records (best free score, best daily score, biggest loop, longest chain) stay on the device and are display only. They never change tiles, junk or points.

## Share text

```
Lasso 2026-11-10
1,540 points, 12 loops, biggest 16, chain 3
🟡🟡🟠🟡🔴
```

`, chain N` appears only when the longest chain was 2 or more. One mark per loop, in the order they were closed, up to 20 marks and then ` +N`. Area under 7 is 🟡, 7 to 15 is 🟠, and 16 or more is 🔴. It gives no positions.

## Test vectors

| Date | Seed | Starting junk cells, sorted | First hand | Next nine tiles |
|---|---|---|---|---|
| 2026-11-10 | 3580070051 | 16, 41, 59, 64, 66, 74 | SW SW V | SW ESW ES ES WNE ESW NES NE H |
| 2027-01-01 | 1093525321 | 1, 25, 38, 51, 59, 62 | NE WNE NES | WN SW SW NE WN ES SWN V WN |

Playout check: starting from each seed, repeatedly take the lowest hand slot that has a legal cell and place it on that tile's lowest legal cell index, until the run ends.

| Date | Tiles placed | Score | Loops |
|---|---|---|---|
| 2026-11-10 | 86 | 920 | 5 |
| 2027-01-01 | 71 | 180 | 1 |

Chain playout: starting from each seed, look at every hand slot in order and each of its legal cells in index order. Value a move at 100 if it closes a loop, otherwise at the number of its rope ends that link to a neighboring tile. Play the first move with the highest value, until the run ends.

| Date | Tiles placed | Score | Loops | Longest chain | Multiplier of each loop |
|---|---|---|---|---|---|
| 2026-11-10 | 86 | 560 | 6 | 2 | 1 2 1 1 1 1 |
| 2027-01-01 | 82 | 480 | 3 | 1 | 1 1 1 |

`tools/engine.test.mjs` checks these and the rule cases above.

## Tuning record

Measured with `tools/sim.mjs`, 500 runs per bot on the shipped rules. These are bots, so the times are estimates, assuming about 3 seconds per tile.

| Bot | Plays like | Tiles (p10 / median / p90) | Loops | Tiles per loop | First loop at tile | Score (p10 / median / p90) |
|---|---|---|---|---|---|---|
| random | Any legal move | 53 / 59 / 71 | 1 | 45 | 50 | 0 / 80 / 320 |
| casual | Tries to join ends, misses 1 close in 4 | 92 / 115 / 148 | 12 | 10.5 | 7 | 900 / 1,880 / 3,960 |
| careful | Always closes when it can | 101 / 125 / 161 | 14 | 9.4 | 7 | 1,140 / 2,200 / 4,465 |
| ring3 | Plans 3x3 rings | 145 / 194 / 254 | 22 | 9.0 | 10 | 4,215 / 7,175 / 10,775 |
| ring4 | Plans 4x4 rings | 125 / 164 / 218 | 16 | 10.7 | 16 | 4,720 / 9,225 / 16,300 |
| ring5 | Plans 5x5 rings | 107 / 148 / 200 | 14 | 11.2 | 17 | 1,940 / 9,735 / 19,785 |

Casual's first loop comes at tile 4 / 7 / 16 (p10 / median / p90). About 1 loop in 5 scored at ×2 or more for every bot, and the longest chain was typically 2, reaching 3 at p90. None of these bots try to build chains.

What changed from the original brief, and why:

- **Scoring** uses total lassoed area squared. The first formula counted only the enclosed cells, so a 3x3 ring was worth barely more than a 2x2, and nothing rewarded stretching.
- **Tile mix:** curves carry the most weight, with forks well above straights. Straights are still needed to build rings. Fewer forks or more straights made casual play close far fewer loops.
- **Tiles come from a shuffled bag** rather than independent draws, so a needed curve can't stay away for long.
- **Junk:** the brief named junk but didn't define it. There are 6 at the start plus one drop every second hand, which keeps runs near a few minutes and gives loops something worth catching.
- **Rope ends may face walls and junk.** Testing a stricter rule cut runs slightly without improving how often loops closed.
- **Chains** were added so that keeping a loop going across hands is its own small goal. They change only the score: run length and loop frequency did not move. Big loops stay the best plan, because a bot that hoards closures to keep a chain alive scored a median of 1,420 against about 9,200 for the ring builders. A cap of 3 and a cap of 5 measured the same for the bots, so ×5 stays as a rare peak.
- **Early game left alone.** Casual play already closes a first loop by tile 7 at the median, so there was nothing to fix, and rigging the opening hand would have made the deal less honest.
- **Considered and rejected:** a four-way cross tile didn't help loops close, and more junk (a drop every hand) shortened runs but made loops rarer.
