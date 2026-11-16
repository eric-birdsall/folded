/* The fold animation's timeline: mark the strip, fold it under, settle.
 * Only timing lives here; `onFrame` gets `{ highlight, close }` and draws
 * with `drawFoldFrame`. */

const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => v * v * (3 - 2 * v);
const easeInOutCubic = (v) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);

/** Fold state at `t` (0–1 through the animation). */
export function foldStateAt(t) {
  return {
    // 0–20%: the strip lights up and its creases are marked.
    highlight: smooth(clamp(t / 0.2)),
    // 25–85%: the sides slide together.
    close: easeInOutCubic(clamp((t - 0.25) / 0.6)),
  };
}

/** Run the animation over `duration` ms. `onClosed` fires once when the
 * sides meet. Returns a function that stops it. */
export function animateFold({ duration, onFrame, onClosed, onDone }) {
  let frame;
  let start;
  let closed = false;
  const step = (now) => {
    start ??= now;
    const t = clamp((now - start) / duration);
    const state = foldStateAt(t);
    onFrame(state);
    if (!closed && state.close >= 1) {
      closed = true;
      onClosed?.();
    }
    if (t < 1) frame = requestAnimationFrame(step);
    else {
      frame = undefined;
      onDone?.();
    }
  };
  frame = requestAnimationFrame(step);
  return () => frame !== undefined && cancelAnimationFrame(frame);
}
