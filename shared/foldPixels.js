/* The fold applied to a raster image. Pure: works on any `{ width, height,
 * data }` RGBA buffer (an ImageData in the browser, a plain object in tests)
 * and never touches its input.
 *
 * The fold is in paper units; `paper` says how big the paper is in those
 * units, so the same fold gives the same picture at any resolution. Every
 * output pixel is mapped back through `unfoldPoint` and sampled bilinearly.
 * Where the source is off the paper the output is transparent, which is how
 * the paper visibly loses a strip at its edges. */

import { unfoldPoint } from "./foldGeometry.js";

export function foldPixels(source, fold, paper) {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(width * height * 4);
  const toPaperX = paper.width / width;
  const toPaperY = paper.height / height;
  const sample = createSampler(source);
  const color = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const q = { x: (x + 0.5) * toPaperX, y: (y + 0.5) * toPaperY };
      const p = unfoldPoint(fold, q);
      sample(p.x / toPaperX - 0.5, p.y / toPaperY - 0.5, color);
      const i = (y * width + x) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = color[3];
    }
  }
  return { width, height, data: out };
}

/** Bilinear sampling with premultiplied alpha, so edges against the
 * transparent outside don't pick up dark fringes. Pixel centers sit on
 * integer coordinates. */
function createSampler({ width, height, data }) {
  const texel = (x, y, weight, acc) => {
    if (x < 0 || y < 0 || x >= width || y >= height || weight === 0) return;
    const i = (y * width + x) * 4;
    const a = (data[i + 3] / 255) * weight;
    acc[0] += data[i] * a;
    acc[1] += data[i + 1] * a;
    acc[2] += data[i + 2] * a;
    acc[3] += a;
  };
  const acc = [0, 0, 0, 0];
  return (fx, fy, out) => {
    acc[0] = acc[1] = acc[2] = acc[3] = 0;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    texel(x0, y0, (1 - tx) * (1 - ty), acc);
    texel(x0 + 1, y0, tx * (1 - ty), acc);
    texel(x0, y0 + 1, (1 - tx) * ty, acc);
    texel(x0 + 1, y0 + 1, tx * ty, acc);
    const a = acc[3];
    if (a <= 1e-6) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return;
    }
    out[0] = acc[0] / a;
    out[1] = acc[1] / a;
    out[2] = acc[2] / a;
    out[3] = a * 255;
  };
}
