/* Sabotage input: drag across the paper to place the fold line; drag the
 * strip to slide it; drag anywhere else to redraw it. Arrow keys nudge
 * (up/down) and turn (left/right) it. Only the preview lives here; the
 * game controller decides whether a fold is allowed. */

import { createFold, isHidden, shiftFold, signedDistance } from "../shared/foldGeometry.js";

const NUDGE = 12; // paper units
const TURN = Math.PI / 36; // 5°

export function createSabotageInput(canvas, { paper, onChange, onRelease }) {
  let width = 1;
  let minDrag = 0;
  let enabled = false;
  let fold = null;
  let drag = null; // { start, end } while drawing a new line
  let move = null; // { from, base } while sliding the strip
  let pointerId = null;

  const toPaper = (event, clampToPaper) => {
    const rect = canvas.getBoundingClientRect();
    const p = {
      x: ((event.clientX - rect.left) / rect.width) * paper.width,
      y: ((event.clientY - rect.top) / rect.height) * paper.height,
    };
    if (!clampToPaper) return p;
    return { x: Math.min(paper.width, Math.max(0, p.x)), y: Math.min(paper.height, Math.max(0, p.y)) };
  };

  const changed = () => onChange({ fold, drag });
  const build = (start, end) => createFold(start, end, { width, minDrag, paper });

  canvas.addEventListener("pointerdown", (event) => {
    if (!enabled || pointerId !== null) return;
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
    pointerId = event.pointerId;
    // The axis always passes through the start, so starting on the paper
    // guarantees the fold crosses it.
    const p = toPaper(event, true);
    if (fold && isHidden(fold, p)) move = { from: signedDistance(fold, p), base: fold };
    else drag = { start: p, end: p };
    changed();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const p = toPaper(event, false);
    if (move) {
      const moved = shiftFold(move.base, signedDistance(move.base, p) - move.from);
      // Keep the axis on the paper.
      if (build(moved.start, moved.end).fold) fold = moved;
    } else if (drag) {
      drag.end = p;
      const next = build(drag.start, p);
      if (next.fold) fold = next.fold;
    }
    changed();
  });

  const release = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    let error = null;
    if (drag) {
      const result = build(drag.start, drag.end);
      error = result.error ?? null;
    }
    drag = move = null;
    changed();
    onRelease({ fold, error });
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("keydown", (event) => {
    if (!enabled || !fold) return;
    const turn = { ArrowLeft: -TURN, ArrowRight: TURN }[event.key];
    const nudge = { ArrowUp: -NUDGE, ArrowDown: NUDGE }[event.key];
    if (turn === undefined && nudge === undefined) return;
    event.preventDefault();
    let next = fold;
    if (turn) {
      const angle = Math.atan2(fold.dir.y, fold.dir.x) + turn;
      const end = { x: fold.origin.x + Math.cos(angle) * 100, y: fold.origin.y + Math.sin(angle) * 100 };
      next = build(fold.origin, end).fold;
    } else {
      // Up moves the strip up the page whichever way the normal points.
      const delta = nudge * (Math.sign(fold.normal.y) || 1);
      const moved = shiftFold(fold, delta);
      next = build(moved.start, moved.end).fold;
    }
    if (!next) return;
    fold = next;
    changed();
    onRelease({ fold, error: null });
  });

  return {
    get fold() {
      return fold;
    },
    setEnabled(on) {
      enabled = on;
      canvas.tabIndex = on ? 0 : -1;
    },
    /** Start fresh with this round's fold width and minimum drag. */
    reset(options) {
      ({ width, minDrag } = options);
      fold = drag = move = null;
      pointerId = null;
    },
  };
}
