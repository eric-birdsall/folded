/* Painting strokes (paper units) onto a 2D context that's already scaled
 * to paper units. Points are joined with quadratic curves through their
 * midpoints, the same smoothing Drunk Drawing uses. */

const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function stylePen(ctx, pen) {
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = pen.width;
  ctx.strokeStyle = ctx.fillStyle = pen.color;
}

export function paintDot(ctx, p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** The curve piece that ends at `points[end]`'s midpoint with the one
 * before it. Painting these one by one draws a stroke live. */
export function paintSegment(ctx, points, end) {
  const a = points[end - 2];
  const b = points[end - 1];
  const c = points[end];
  const from = a ? midpoint(a, b) : b;
  const to = midpoint(b, c);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(b.x, b.y, to.x, to.y);
  ctx.stroke();
}

/** The last half-segment, painted when a stroke ends. */
export function paintTail(ctx, points) {
  if (points.length < 2) return;
  const last = points.at(-1);
  const from = midpoint(points.at(-2), last);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Paint finished strokes. `open` is a stroke still being drawn (no tail). */
export function paintStrokes(ctx, strokes, pen, open) {
  stylePen(ctx, pen);
  for (const { points } of strokes) {
    if (!points.length) continue;
    paintDot(ctx, points[0]);
    for (let i = 1; i < points.length; i++) paintSegment(ctx, points, i);
    if (points !== open?.points) paintTail(ctx, points);
  }
}

/** White paper with the drawing on it, filling `canvas` (whatever its
 * pixel size). */
export function paintPaper(canvas, strokes, { paper, pen, paperColor }) {
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / paper.width, 0, 0, canvas.height / paper.height, 0, 0);
  ctx.fillStyle = paperColor;
  ctx.fillRect(0, 0, paper.width, paper.height);
  paintStrokes(ctx, strokes || [], pen);
  return canvas;
}
