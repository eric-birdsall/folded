/* Drawing folds on a canvas: the sabotage preview, each frame of the fold
 * animation, and the finished folded image. The finished image comes from
 * the same tested `foldPixels` the game uses, so what players guess from is
 * exactly the fold that was chosen. */

import { creaseLines, halfPlanePolygon, signedDistance } from "../shared/foldGeometry.js";
import { foldPixels } from "../shared/foldPixels.js";

const TINT = "rgb(226 84 58)";

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** The band between two lines parallel to the axis, as a polygon. */
function band(fold, from, to, reach) {
  const [a, b] = halfPlanePolygon(fold, from, 1, reach);
  const [c, d] = halfPlanePolygon(fold, to, 1, reach);
  return [a, b, d, c];
}

function line(ctx, [a, b]) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

const reachFor = (paper) => 4 * Math.max(paper.width, paper.height);
const pxToPaper = (ctx) => 1 / ctx.getTransform().a;

/** Set `ctx` up to draw in paper units over the whole canvas. */
export function usePaperUnits(ctx, paper) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(ctx.canvas.width / paper.width, 0, 0, ctx.canvas.height / paper.height, 0, 0);
}

/** The original drawing, with the strip that will vanish shaded. Nothing
 * here touches `source`. */
export function drawFoldPreview(ctx, source, paper, { fold, drag }) {
  usePaperUnits(ctx, paper);
  ctx.drawImage(source, 0, 0, paper.width, paper.height);
  const px = pxToPaper(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, paper.width, paper.height);
  ctx.clip();
  if (fold) {
    const half = fold.width / 2;
    const reach = reachFor(paper);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = TINT;
    polygon(ctx, band(fold, -half, half, reach));
    ctx.fill();
    // Diagonal hatching so the strip reads as "gone" even in color-blind
    // eyes and over dense ink.
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = TINT;
    polygon(ctx, band(fold, -half, half, reach));
    ctx.save();
    ctx.clip();
    for (let t = -reach; t < reach; t += 22) {
      const a = {
        x: fold.origin.x + fold.dir.x * t - fold.normal.x * half,
        y: fold.origin.y + fold.dir.y * t - fold.normal.y * half,
      };
      line(ctx, [
        a,
        { x: a.x + (fold.normal.x + fold.dir.x) * fold.width, y: a.y + (fold.normal.y + fold.dir.y) * fold.width },
      ]);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    const creases = creaseLines(fold, reach);
    ctx.strokeStyle = TINT;
    ctx.lineWidth = 3 * px;
    line(ctx, creases.positive);
    line(ctx, creases.negative);
    ctx.setLineDash([10 * px, 8 * px]);
    ctx.lineWidth = 2 * px;
    ctx.globalAlpha = 0.8;
    line(ctx, creases.axis);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawClosingArrows(ctx, fold, paper, px);
  }
  if (drag) {
    ctx.strokeStyle = TINT;
    ctx.lineWidth = 3 * px;
    ctx.setLineDash([4 * px, 6 * px]);
    line(ctx, [drag.start, drag.end]);
    ctx.setLineDash([]);
    ctx.fillStyle = TINT;
    for (const p of [drag.start, drag.end]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 * px, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Chevrons on both sides pointing at the axis: "these sides close up". */
function drawClosingArrows(ctx, fold, paper, px) {
  const center = { x: paper.width / 2, y: paper.height / 2 };
  const d = signedDistance(fold, center);
  const foot = { x: center.x - fold.normal.x * d, y: center.y - fold.normal.y * d };
  const size = 20 * px;
  ctx.strokeStyle = TINT;
  ctx.lineWidth = 5 * px;
  for (const along of [-0.28, 0.28]) {
    for (const side of [1, -1]) {
      const base = fold.width / 2 + 10 * px + size;
      const tip = {
        x: foot.x + fold.dir.x * along * paper.width + fold.normal.x * side * base,
        y: foot.y + fold.dir.y * along * paper.height + fold.normal.y * side * base,
      };
      const back = (sideways) => ({
        x: tip.x + fold.normal.x * side * size + fold.dir.x * sideways * size,
        y: tip.y + fold.normal.y * side * size + fold.dir.y * sideways * size,
      });
      ctx.beginPath();
      ctx.moveTo(back(-1).x, back(-1).y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(back(1).x, back(1).y);
      ctx.stroke();
    }
  }
}

/** One frame of the fold. `highlight` (0–1) tints the strip and shows its
 * creases; `close` (0–1) is how far each side has slid toward the axis.
 * At close = 1 this is the finished fold.
 *
 * The strip between the moving creases is drawn squashed toward the axis
 * and shaded darker in the middle, like a valley disappearing under the
 * paper; each side is drawn on top, clipped at its crease and slid in. */
export function drawFoldFrame(ctx, source, paper, fold, { highlight = 0, close = 0 }) {
  usePaperUnits(ctx, paper);
  const px = pxToPaper(ctx);
  const half = fold.width / 2;
  const reach = reachFor(paper);
  const { origin: o, normal: n } = fold;
  const open = 1 - close;

  // The strip, squashed by `open` along the normal, about the axis.
  if (open > 0.002) {
    const k = open - 1;
    const a = 1 + k * n.x * n.x;
    const b = k * n.x * n.y;
    const d = 1 + k * n.y * n.y;
    ctx.save();
    ctx.transform(a, b, b, d, o.x - (a * o.x + b * o.y), o.y - (b * o.x + d * o.y));
    ctx.beginPath();
    ctx.rect(0, 0, paper.width, paper.height);
    ctx.clip();
    polygon(ctx, band(fold, -half, half, reach));
    ctx.clip();
    ctx.drawImage(source, 0, 0, paper.width, paper.height);
    if (highlight > 0) {
      ctx.globalAlpha = 0.28 * highlight * (1 - close * 0.6);
      ctx.fillStyle = TINT;
      ctx.fillRect(-reach, -reach, 2 * reach, 2 * reach);
      ctx.globalAlpha = 1;
    }
    if (close > 0) {
      const from = { x: o.x - n.x * half, y: o.y - n.y * half };
      const to = { x: o.x + n.x * half, y: o.y + n.y * half };
      const shade = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      const edge = 0.12 + 0.3 * close;
      const valley = 0.25 + 0.5 * close;
      shade.addColorStop(0, `rgb(20 24 30 / ${edge})`);
      shade.addColorStop(0.5, `rgb(20 24 30 / ${valley})`);
      shade.addColorStop(1, `rgb(20 24 30 / ${edge})`);
      ctx.fillStyle = shade;
      ctx.fillRect(-reach, -reach, 2 * reach, 2 * reach);
    }
    ctx.restore();
  }

  // Each side, slid toward the axis and clipped at its crease.
  for (const side of [1, -1]) {
    ctx.save();
    ctx.translate(-n.x * side * half * close, -n.y * side * half * close);
    polygon(ctx, halfPlanePolygon(fold, side * half, side, reach));
    ctx.clip();
    ctx.drawImage(source, 0, 0, paper.width, paper.height);
    ctx.restore();
  }

  // Crease lines: dashed while they're being marked, then a solid fold edge.
  if (highlight > 0 && open > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, paper.width, paper.height);
    ctx.clip();
    ctx.strokeStyle = TINT;
    ctx.globalAlpha = highlight * Math.min(1, open * 3);
    ctx.lineWidth = 3 * px;
    ctx.setLineDash([12 * px, 8 * px]);
    const creases = creaseLines(fold, reach);
    for (const side of [1, -1]) {
      const crease = side === 1 ? creases.positive : creases.negative;
      const shift = { x: -n.x * side * half * close, y: -n.y * side * half * close };
      line(
        ctx,
        crease.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })),
      );
    }
    ctx.restore();
  }
  if (close > 0.98) drawSeam(ctx, paper, fold);
}

/** A faint crease where the two sides meet, so the fold stays readable. */
export function drawSeam(ctx, paper, fold) {
  const px = pxToPaper(ctx);
  const reach = reachFor(paper);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, paper.width, paper.height);
  ctx.clip();
  ctx.strokeStyle = "rgb(20 24 30 / 0.16)";
  ctx.lineWidth = 2 * px;
  line(ctx, creaseLines(fold, reach).axis);
  ctx.restore();
}

/** The finished fold as its own canvas, made by `foldPixels`. */
export function foldedCanvas(source, paper, fold) {
  const { width, height } = source;
  const pixels = source.getContext("2d").getImageData(0, 0, width, height);
  const folded = foldPixels(pixels, fold, paper);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  out.getContext("2d").putImageData(new ImageData(folded.data, width, height), 0, 0);
  return out;
}

/** Show a finished folded image, plus the seam. */
export function drawFolded(ctx, folded, paper, fold) {
  usePaperUnits(ctx, paper);
  ctx.drawImage(folded, 0, 0, paper.width, paper.height);
  drawSeam(ctx, paper, fold);
}
