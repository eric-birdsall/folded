/* The fold, as plain geometry in paper units. No canvas, no DOM.
 *
 * A fold is a straight strip of paper, `width` wide, centered on an
 * infinitely long axis through the saboteur's drag. The strip is tucked
 * underneath and the paper on each side slides `width / 2` toward the axis,
 * so the two sides meet at a seam where the axis was. Nothing is scaled:
 * content outside the strip just moves, content inside it disappears. */

import { ERROR } from "./config.js";

const isPoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Fold width in paper units: `share` of the paper's shorter side. */
export function foldWidthFor(paper, share) {
  return share * Math.min(paper.width, paper.height);
}

/** Minimum drag length in paper units. */
export function minDragFor(paper, share) {
  return share * Math.min(paper.width, paper.height);
}

/** Build a fold from a drag. The drag sets the axis position and angle; its
 * length only has to pass `minDrag`. With `paper`, the axis must also cross
 * the paper. Returns `{ fold }` or `{ error }` (an ERROR value). */
export function createFold(start, end, { width, minDrag = 0, paper } = {}) {
  if (!isPoint(start) || !isPoint(end) || !(width > 0)) {
    return { error: ERROR.FOLD_TOO_SHORT };
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || length < minDrag) return { error: ERROR.FOLD_TOO_SHORT };
  const dir = { x: dx / length, y: dy / length };
  const fold = Object.freeze({
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    origin: { x: start.x, y: start.y },
    dir,
    normal: { x: -dir.y, y: dir.x },
    width,
  });
  if (paper && !axisCrossesPaper(fold, paper)) return { error: ERROR.FOLD_MISSES_PAPER };
  return { fold };
}

/** Signed perpendicular distance from the fold axis (positive on the
 * `normal` side). */
export function signedDistance(fold, p) {
  return (p.x - fold.origin.x) * fold.normal.x + (p.y - fold.origin.y) * fold.normal.y;
}

/** True when the axis passes through the paper (or along its edge). */
export function axisCrossesPaper(fold, paper) {
  const corners = [
    { x: 0, y: 0 },
    { x: paper.width, y: 0 },
    { x: 0, y: paper.height },
    { x: paper.width, y: paper.height },
  ].map((c) => signedDistance(fold, c));
  return Math.min(...corners) <= 0 && Math.max(...corners) >= 0;
}

/** Is this point on the strip that gets folded away? The strip includes
 * its negative edge and not its positive one, so every surviving point has
 * exactly one place in the result (see `unfoldPoint`). */
export function isHidden(fold, p) {
  const d = signedDistance(fold, p);
  return d >= -fold.width / 2 && d < fold.width / 2;
}

/** Where a point of the original drawing ends up after folding, or null if
 * it was on the hidden strip. `progress` (0 to 1) gives in-between states
 * for the animation; 1 is the finished fold. */
export function foldPoint(fold, p, progress = 1) {
  if (isHidden(fold, p)) return null;
  const d = signedDistance(fold, p);
  const half = fold.width / 2;
  const shift = Math.sign(d) * half * progress;
  return { x: p.x - fold.normal.x * shift, y: p.y - fold.normal.y * shift };
}

/** Inverse of a finished fold: which original point shows at `q`. Every
 * point of the folded result has exactly one source; the axis itself shows
 * the edge of the positive side. */
export function unfoldPoint(fold, q) {
  const d = signedDistance(fold, q);
  const shift = (d >= 0 ? 1 : -1) * (fold.width / 2);
  return { x: q.x + fold.normal.x * shift, y: q.y + fold.normal.y * shift };
}

/** A convex polygon covering everything on one side of a line parallel to
 * the axis, `offset` units along the normal. `side` is 1 for the normal side,
 * -1 for the other. `reach` must be bigger than anything it should cover. */
export function halfPlanePolygon(fold, offset, side, reach) {
  const { origin, dir, normal } = fold;
  const at = (along, across) => ({
    x: origin.x + dir.x * along + normal.x * across,
    y: origin.y + dir.y * along + normal.y * across,
  });
  return [at(-reach, offset), at(reach, offset), at(reach, offset + side * reach), at(-reach, offset + side * reach)];
}

/** The two crease lines (strip edges), each clipped to a long segment
 * through the paper, for drawing the preview. */
export function creaseLines(fold, reach) {
  const half = fold.width / 2;
  const line = (across) => {
    const [a, b] = halfPlanePolygon(fold, across, 1, reach);
    return [a, b];
  };
  return { axis: line(0), positive: line(half), negative: line(-half) };
}

/** Move a fold sideways by `delta` units along its normal (for dragging the
 * preview strip around). Angle and width stay the same. */
export function shiftFold(fold, delta) {
  const move = (p) => ({ x: p.x + fold.normal.x * delta, y: p.y + fold.normal.y * delta });
  return Object.freeze({ ...fold, start: move(fold.start), end: move(fold.end), origin: move(fold.origin) });
}

/** A reasonable fold when the saboteur never placed one: through the middle
 * of the ink (or the paper, if it's blank) at a random angle. */
export function fallbackFold({ bounds, paper, width, random = Math.random }) {
  const center = bounds
    ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
    : { x: paper.width / 2, y: paper.height / 2 };
  const angle = random() * Math.PI;
  const end = { x: center.x + Math.cos(angle) * 100, y: center.y + Math.sin(angle) * 100 };
  return createFold(center, end, { width }).fold;
}

/** The fold as plain data for storing or sending. */
export function foldData(fold) {
  return fold && { start: { ...fold.start }, end: { ...fold.end }, width: fold.width };
}

/** Rebuild a fold from `foldData`. */
export function foldFromData(data) {
  return data ? createFold(data.start, data.end, { width: data.width }).fold : null;
}
