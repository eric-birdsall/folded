import assert from "node:assert/strict";
import test from "node:test";
import { ERROR } from "../shared/config.js";
import {
  axisCrossesPaper,
  createFold,
  creaseLines,
  fallbackFold,
  foldFromData,
  foldData,
  foldPoint,
  isHidden,
  shiftFold,
  signedDistance,
  unfoldPoint,
} from "../shared/foldGeometry.js";
import { foldPixels } from "../shared/foldPixels.js";

const PAPER = { width: 100, height: 100 };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const fold = (start, end, width = 20) => createFold(start, end, { width }).fold;

/** A blank white RGBA image whose pixels come from `paint(x, y)` in paper
 * units (return [r, g, b] or null for white). */
function image(size, paint, paper = PAPER) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) * paper.width) / size;
      const py = ((y + 0.5) * paper.height) / size;
      const [r, g, b] = paint(px, py) || [255, 255, 255];
      data.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

const pixel = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
const GREEN = [0, 160, 0];

/** Three horizontal bands: red at the top, green in the middle (where a
 * horizontal fold will hide it), blue at the bottom. */
const bands = (x, y) => (y < 40 ? RED : y < 60 ? GREEN : BLUE);

test("a drag builds a unit direction and a perpendicular normal", () => {
  for (const end of [
    { x: 90, y: 50 },
    { x: 50, y: 95 },
    { x: 80, y: 80 },
    { x: 3, y: 47 },
  ]) {
    const f = fold({ x: 50, y: 50 }, end);
    assert.ok(near(Math.hypot(f.dir.x, f.dir.y), 1));
    assert.ok(near(Math.hypot(f.normal.x, f.normal.y), 1));
    assert.ok(near(f.dir.x * f.normal.x + f.dir.y * f.normal.y, 0));
    assert.ok(near(signedDistance(f, end), 0), "the axis runs through both drag points");
  }
});

test("zero-length, too-short and malformed drags are rejected", () => {
  const options = { width: 20, minDrag: 6 };
  assert.equal(createFold({ x: 5, y: 5 }, { x: 5, y: 5 }, options).error, ERROR.FOLD_TOO_SHORT);
  assert.equal(createFold({ x: 5, y: 5 }, { x: 8, y: 7 }, options).error, ERROR.FOLD_TOO_SHORT);
  assert.equal(createFold({ x: 5, y: NaN }, { x: 80, y: 7 }, options).error, ERROR.FOLD_TOO_SHORT);
  assert.equal(createFold(null, { x: 80, y: 7 }, options).error, ERROR.FOLD_TOO_SHORT);
  assert.equal(createFold({ x: 5, y: 5 }, { x: 80, y: 5 }, { width: 0 }).error, ERROR.FOLD_TOO_SHORT);
  assert.ok(createFold({ x: 5, y: 5 }, { x: 12, y: 5 }, options).fold);
});

test("the drag sets the angle, not the length of the strip", () => {
  const short = fold({ x: 50, y: 50 }, { x: 60, y: 50 });
  const long = fold({ x: 10, y: 50 }, { x: 400, y: 50 });
  for (const p of [
    { x: 0, y: 30 },
    { x: 99, y: 70 },
    { x: -500, y: 20 },
    { x: 50, y: 52 },
  ]) {
    assert.deepEqual(foldPoint(short, p), foldPoint(long, p));
  }
});

test("folds must cross the paper; drags running off the edge are fine", () => {
  assert.ok(axisCrossesPaper(fold({ x: -50, y: 10 }, { x: 150, y: 90 }), PAPER));
  assert.ok(axisCrossesPaper(fold({ x: 0, y: 0 }, { x: 100, y: 0 }), PAPER), "along the edge counts");
  assert.equal(
    createFold({ x: -20, y: -20 }, { x: -20, y: 200 }, { width: 10, paper: PAPER }).error,
    ERROR.FOLD_MISSES_PAPER,
  );
  assert.ok(createFold({ x: 50, y: 50 }, { x: 900, y: 52 }, { width: 10, paper: PAPER }).fold);
});

test("points: outside the strip slide half the width toward the axis, inside vanish", () => {
  const f = fold({ x: 0, y: 50 }, { x: 100, y: 50 }); // horizontal axis, y = 50, width 20
  const side = Math.sign(f.normal.y); // which way "positive" points
  const above = foldPoint(f, { x: 30, y: 20 });
  const below = foldPoint(f, { x: 30, y: 85 });
  assert.deepEqual([above.x, above.y], [30, 30]);
  assert.deepEqual([below.x, below.y], [30, 75]);
  assert.equal(foldPoint(f, { x: 30, y: 45 }), null);
  assert.equal(foldPoint(f, { x: 30, y: 59.9 }), null);
  assert.ok(isHidden(f, { x: 0, y: 50 }) && !isHidden(f, { x: 0, y: 61 }));
  // The two strip edges meet at the axis.
  assert.ok(near(foldPoint(f, { x: 7, y: 60 }).y, 50));
  assert.ok(near(foldPoint(f, { x: 7, y: 40 - 1e-9 }).y, 50, 1e-6));
  assert.equal(foldPoint(f, { x: 7, y: 40 }), null, "the negative edge belongs to the strip");
  assert.ok(side !== 0);
});

test("unfoldPoint inverts foldPoint everywhere the folded paper shows", () => {
  for (const f of [
    fold({ x: 0, y: 50 }, { x: 100, y: 50 }),
    fold({ x: 30, y: 0 }, { x: 30, y: 100 }),
    fold({ x: 10, y: 20 }, { x: 70, y: 95 }, 13),
  ]) {
    for (let i = 0; i < 400; i++) {
      const p = { x: (i * 37) % 100, y: (i * 61) % 100 };
      const q = foldPoint(f, p);
      if (!q) continue;
      const back = unfoldPoint(f, q);
      assert.ok(near(back.x, p.x, 1e-9) && near(back.y, p.y, 1e-9));
    }
  }
});

test("pixels: a horizontal fold removes the horizontal strip and closes the gap", () => {
  const source = image(100, bands);
  const before = new Uint8ClampedArray(source.data);
  const f = fold({ x: 0, y: 50 }, { x: 100, y: 50 }); // hides 40..60: exactly the green band
  const out = foldPixels(source, f, PAPER);
  assert.deepEqual(source.data, before, "the original drawing is untouched");
  const column = Array.from({ length: 100 }, (_, y) => pixel(out, 50, y));
  assert.ok(
    column.every(([r, g, b]) => !(g > 100 && r < 100 && b < 100)),
    "no green survives",
  );
  // Red now runs right down to the seam and blue starts right after it.
  assert.deepEqual(pixel(out, 50, 49), [...RED, 255]);
  assert.deepEqual(pixel(out, 50, 50), [...BLUE, 255]);
  // The paper is shorter: half the strip is gone from each edge.
  assert.equal(pixel(out, 50, 5)[3], 0);
  assert.equal(pixel(out, 50, 94)[3], 0);
  assert.deepEqual(pixel(out, 50, 11), [...RED, 255]);
  assert.deepEqual(pixel(out, 50, 88), [...BLUE, 255]);
  // Left to right nothing changes.
  for (const x of [0, 33, 99]) assert.deepEqual(pixel(out, x, 30), pixel(out, 50, 30));
});

test("pixels: a vertical fold removes the vertical strip and closes the gap", () => {
  const source = image(100, (x, y) => bands(y, x)); // the same bands on their side
  const f = fold({ x: 50, y: 0 }, { x: 50, y: 100 });
  const out = foldPixels(source, f, PAPER);
  assert.deepEqual(pixel(out, 49, 50), [...RED, 255]);
  assert.deepEqual(pixel(out, 50, 50), [...BLUE, 255]);
  assert.equal(pixel(out, 5, 50)[3], 0);
  assert.equal(pixel(out, 94, 50)[3], 0);
  const row = Array.from({ length: 100 }, (_, x) => pixel(out, x, 50));
  assert.ok(row.every(([r, g, b]) => !(g > 100 && r < 100 && b < 100)));
});

test("pixels: a diagonal fold agrees with the point transform", () => {
  // Small dots spread over the page, each a different color.
  const dots = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) dots.push({ x: 10 + i * 16, y: 8 + j * 16, c: [40 * i, 40 * j, 128] });
  const paint = (x, y) => dots.find((d) => Math.hypot(d.x - x, d.y - y) < 3)?.c;
  const source = image(200, paint);
  const f = fold({ x: 10, y: 15 }, { x: 85, y: 90 }, 18);
  const out = foldPixels(source, f, PAPER);
  let moved = 0;
  let hidden = 0;
  for (const d of dots) {
    const q = foldPoint(f, d);
    if (!q) {
      hidden++;
      continue;
    }
    if (q.x < 1 || q.y < 1 || q.x > 99 || q.y > 99) continue;
    moved++;
    const [r, g, b, a] = pixel(out, Math.floor(q.x * 2), Math.floor(q.y * 2));
    assert.deepEqual([r, g, b, a], [...d.c, 255], `dot at ${d.x},${d.y} lands at ${q.x},${q.y}`);
  }
  assert.ok(hidden > 0 && moved > 20);
  // Nothing from inside the strip shows anywhere. (Dots poking out past a
  // crease line rightly leave a sliver, so only count ones fully inside.)
  const inside = dots.filter((d) => Math.abs(signedDistance(f, d)) < f.width / 2 - 3.5);
  assert.ok(inside.length > 0);
  const hiddenColors = new Set(inside.map((d) => d.c.join()));
  for (let i = 0; i < out.data.length; i += 4) {
    assert.ok(!hiddenColors.has([out.data[i], out.data[i + 1], out.data[i + 2]].join()) || out.data[i + 3] < 255);
  }
});

test("folding is deterministic and leaves its input alone", () => {
  const source = image(64, (x, y) => ((x * 3 + y * 7) % 20 < 4 ? RED : null));
  const copy = new Uint8ClampedArray(source.data);
  const f = fold({ x: 20, y: 70 }, { x: 90, y: 10 }, 15);
  const a = foldPixels(source, f, PAPER);
  const b = foldPixels(source, f, PAPER);
  assert.deepEqual(a.data, b.data);
  assert.deepEqual(source.data, copy);
  // Round-tripping through plain data gives the same fold.
  assert.deepEqual(foldPixels(source, foldFromData(foldData(f)), PAPER).data, a.data);
});

test("the result doesn't depend on resolution or aspect ratio", () => {
  const paper = { width: 160, height: 100 };
  const paint = (x, y) => (Math.abs(x - 80) < 25 && Math.abs(y - 50) < 30 ? BLUE : null);
  const f = fold({ x: 20, y: 30 }, { x: 140, y: 60 }, 16);
  const sizes = [
    [80, 50],
    [320, 200],
  ];
  const outs = sizes.map(([w, h]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = paint(((x + 0.5) * paper.width) / w, ((y + 0.5) * paper.height) / h) || [255, 255, 255];
        data.set([...c, 255], (y * w + x) * 4);
      }
    return foldPixels({ width: w, height: h, data }, f, paper);
  });
  // Compare at paper points well away from any edge.
  let compared = 0;
  for (let i = 0; i < 300; i++) {
    const q = { x: 5 + ((i * 53) % 150), y: 5 + ((i * 29) % 90) };
    const p = unfoldPoint(f, q);
    const edge = Math.min(
      Math.abs(Math.abs(p.x - 80) - 25),
      Math.abs(Math.abs(p.y - 50) - 30),
      p.x,
      p.y,
      paper.width - p.x,
      paper.height - p.y,
      Math.abs(signedDistance(f, q)),
    );
    if (edge < 3) continue;
    const [a, b] = outs.map((img, k) => {
      const [w, h] = sizes[k];
      return pixel(img, Math.floor((q.x * w) / paper.width), Math.floor((q.y * h) / paper.height));
    });
    assert.deepEqual(a, b);
    compared++;
  }
  assert.ok(compared > 100);
});

test("a fold near the paper edge just trims that edge", () => {
  const source = image(100, bands);
  const f = fold({ x: 0, y: 3 }, { x: 100, y: 3 });
  const out = foldPixels(source, f, PAPER);
  // Below the strip the page slides up 10 units; the bottom 10 are bare.
  assert.deepEqual(pixel(out, 50, 25), [...RED, 255]);
  assert.deepEqual(pixel(out, 50, 45), [...GREEN, 255]);
  assert.deepEqual(pixel(out, 50, 75), [...BLUE, 255]);
  assert.equal(pixel(out, 50, 95)[3], 0);
});

test("a blank page folds into a smaller blank page", () => {
  const out = foldPixels(
    image(50, () => null),
    fold({ x: 0, y: 0 }, { x: 100, y: 100 }),
    PAPER,
  );
  for (let i = 0; i < out.data.length; i += 4) {
    const [r, g, b, a] = out.data.slice(i, i + 4);
    assert.ok(a === 0 || (r > 250 && g > 250 && b > 250));
  }
});

test("helpers: crease lines, moving the strip, and the fallback fold", () => {
  const f = fold({ x: 0, y: 50 }, { x: 100, y: 50 });
  const { positive, negative, axis } = creaseLines(f, 500);
  assert.ok(near(Math.abs(signedDistance(f, positive[0])), 10));
  assert.ok(near(Math.abs(signedDistance(f, negative[1])), 10));
  assert.ok(near(signedDistance(f, axis[0]), 0));
  const moved = shiftFold(f, 15);
  assert.ok(near(signedDistance(f, moved.origin), 15));
  assert.deepEqual(moved.dir, f.dir);
  const fb = fallbackFold({
    bounds: { minX: 20, minY: 20, maxX: 40, maxY: 60 },
    paper: PAPER,
    width: 12,
    random: () => 0.3,
  });
  assert.ok(near(signedDistance(fb, { x: 30, y: 40 }), 0, 1e-9));
  assert.equal(fb.width, 12);
  assert.ok(fallbackFold({ bounds: null, paper: PAPER, width: 12, random: () => 0.7 }));
});
