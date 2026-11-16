/* Drawings as data: a list of strokes, each `{ points: [{ x, y }, ...] }`
 * in paper units. The same strokes render at any size, so nothing needs
 * re-sampling when the screen changes. */

const MAX_STROKES = 600;
const MAX_POINTS = 4000;

/** Keep only well-formed strokes, with points clamped onto the paper. This
 * is what the game controller stores, whatever a client sent. */
export function cleanStrokes(strokes, paper) {
  if (!Array.isArray(strokes)) return [];
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  return strokes
    .slice(0, MAX_STROKES)
    .map((stroke) => ({
      points: (Array.isArray(stroke?.points) ? stroke.points : [])
        .slice(0, MAX_POINTS)
        .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        .map((p) => ({ x: clamp(p.x, paper.width), y: clamp(p.y, paper.height) })),
    }))
    .filter((stroke) => stroke.points.length);
}

export const hasInk = (strokes) => strokes.some((stroke) => stroke.points.length);

/** Bounding box of every point, or null for a blank page. */
export function inkBounds(strokes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { points } of strokes) {
    for (const { x, y } of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
