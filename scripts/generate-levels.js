// One-off generator for "Arrows Puzzle Escape" levels.
// Builds each level by placing arrows in reverse-removal order so a valid
// solution always exists, then prints the resulting level data as JSON.

const DIRS = [
  { name: "up", dr: -1, dc: 0 },
  { name: "down", dr: 1, dc: 0 },
  { name: "left", dr: 0, dc: -1 },
  { name: "right", dr: 0, dc: 1 },
];

function pathToEdge(r, c, dir, rows, cols) {
  const cells = [];
  let cr = r + dir.dr;
  let cc = c + dir.dc;
  while (cr >= 0 && cr < rows && cc >= 0 && cc < cols) {
    cells.push([cr, cc]);
    cr += dir.dr;
    cc += dir.dc;
  }
  return cells;
}

function generateLevel(rows, cols, count, seed) {
  let rngState = seed;
  function rand() {
    // simple LCG for reproducibility
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    return rngState / 0x7fffffff;
  }

  const occupied = new Set();
  const arrows = []; // placed in reverse-removal order (last removed first)

  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 500) {
    attempts++;
    const r = Math.floor(rand() * rows);
    const c = Math.floor(rand() * cols);
    const key = `${r},${c}`;
    if (occupied.has(key)) continue;

    const dirOrder = [...DIRS].sort(() => rand() - 0.5);
    let chosen = null;
    for (const dir of dirOrder) {
      const path = pathToEdge(r, c, dir, rows, cols);
      const blocked = path.some(([pr, pc]) => occupied.has(`${pr},${pc}`));
      if (!blocked) {
        chosen = dir;
        break;
      }
    }
    if (!chosen) continue;

    occupied.add(key);
    arrows.push({ r, c, dir: chosen.name });
    placed++;
  }

  // arrows[] is in reverse-removal order (first entry removed last).
  // Reverse so arrows[0] is removed first in the solution order.
  const removalOrder = [...arrows].reverse();

  return {
    rows,
    cols,
    arrows: arrows.map(({ r, c, dir }) => ({ r, c, dir })),
    solutionLength: removalOrder.length,
  };
}

const configs = [
  { rows: 4, cols: 4, count: 4 },
  { rows: 4, cols: 4, count: 6 },
  { rows: 5, cols: 5, count: 8 },
  { rows: 5, cols: 5, count: 10 },
  { rows: 5, cols: 5, count: 12 },
  { rows: 6, cols: 6, count: 14 },
  { rows: 6, cols: 6, count: 16 },
  { rows: 6, cols: 6, count: 18 },
  { rows: 7, cols: 7, count: 22 },
  { rows: 7, cols: 7, count: 26 },
  { rows: 7, cols: 7, count: 30 },
  { rows: 8, cols: 8, count: 36 },
];

const levels = configs.map((cfg, i) =>
  generateLevel(cfg.rows, cfg.cols, cfg.count, 1000 + i * 97)
);

console.log(JSON.stringify(levels, null, 2));
