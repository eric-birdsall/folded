/* Drawing input: turns pointer drags on the paper canvas into strokes in
 * paper units, paints them as they're drawn, and supports undo and clear.
 * It knows nothing about rounds or timers; `onChange` reports the strokes
 * whenever a stroke ends or the page changes. */

import { paintDot, paintSegment, paintStrokes, paintTail, stylePen } from "./strokes.js";

const MIN_STEP = 1.5; // paper units between recorded points

export function createDrawingPad(canvas, { paper, pen, paperColor, onChange }) {
  const ctx = canvas.getContext("2d");
  const strokes = [];
  let active = null;
  let pointerId = null;
  let enabled = false;

  function toPaper(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(paper.width, Math.max(0, ((event.clientX - rect.left) / rect.width) * paper.width)),
      y: Math.min(paper.height, Math.max(0, ((event.clientY - rect.top) / rect.height) * paper.height)),
    };
  }

  function useCanvas() {
    ctx.setTransform(canvas.width / paper.width, 0, 0, canvas.height / paper.height, 0, 0);
    stylePen(ctx, pen);
  }

  function redraw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    useCanvas();
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, paper.width, paper.height);
    paintStrokes(ctx, strokes, pen, active);
  }

  function add(p) {
    const { points } = active;
    const last = points.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) return;
    points.push(p);
    useCanvas();
    if (points.length === 1) paintDot(ctx, p);
    else paintSegment(ctx, points, points.length - 1);
  }

  function end() {
    if (!active) return;
    useCanvas();
    paintTail(ctx, active.points);
    active = null;
    pointerId = null;
    onChange?.(snapshot());
  }

  const snapshot = () => strokes.map((s) => ({ points: s.points.map((p) => ({ ...p })) }));

  canvas.addEventListener("pointerdown", (event) => {
    if (!enabled || active || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
    pointerId = event.pointerId;
    active = { points: [] };
    strokes.push(active);
    add(toPaper(event));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!active || event.pointerId !== pointerId) return;
    const events = event.getCoalescedEvents?.() || [event];
    for (const e of events.length ? events : [event]) add(toPaper(e));
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === pointerId) end();
    });
  }

  return {
    redraw,
    end,
    get strokes() {
      return snapshot();
    },
    get hasInk() {
      return strokes.length > 0;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) end();
    },
    reset() {
      active = null;
      pointerId = null;
      strokes.length = 0;
      redraw();
    },
    undo() {
      end();
      strokes.pop();
      redraw();
      onChange?.(snapshot());
    },
    clear() {
      end();
      strokes.length = 0;
      redraw();
      onChange?.(snapshot());
    },
  };
}
