/* Folded: screens and wiring. The game controller (shared/game.js) owns
 * every rule; this file shows the right view to whoever holds the device
 * and turns taps into controller events. */

import { DEFAULT_TEAMS, EVENT, FOLDED, LABELS, OUTCOME, PHASE, TIMED_PHASES } from "../shared/config.js";
import { hasInk } from "../shared/drawing.js";
import { foldFromData, foldWidthFor, minDragFor } from "../shared/foldGeometry.js";
import { createMatch } from "../shared/game.js";
import { createDrawingPad } from "./drawingPad.js";
import { animateFold } from "./foldAnimation.js";
import { drawFoldFrame, drawFoldPreview, drawFolded, foldedCanvas } from "./foldRender.js";
import { createSabotageInput } from "./sabotageInput.js";
import { isMuted, setMuted, sfx, unlockAudio } from "./sound.js";
import { paintPaper } from "./strokes.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const now = () => performance.now();
const PAPER = { paper: FOLDED.paper, pen: FOLDED.pen, paperColor: FOLDED.paperColor };
const SETUP_KEY = "folded-setup";

const match = createMatch();
let shownKey = null;

/* ---------- Static labels ---------- */

const text = (selector, value) => ($(selector).textContent = value);
text("[data-tagline]", LABELS.tagline);
text("[data-start]", LABELS.start);
text("[data-undo]", LABELS.undo);
text("[data-clear]", LABELS.clear);
text("[data-submit]", LABELS.submitDrawing);
text("[data-confirm]", LABELS.confirmFold);
text("[data-guess-button]", LABELS.guessButton);
text("[data-give-up]", LABELS.giveUp);
text("[data-answer-label]", LABELS.answerWas);
text("[data-before-label]", LABELS.original);
text("[data-after-label]", LABELS.folded);
text("[data-final-label]", LABELS.finalScores);
text("[data-again]", LABELS.playAgain);
text("[data-new-teams]", LABELS.newTeams);
$("[data-guess-input]").placeholder = LABELS.guessPlaceholder;

/* ---------- Setup ---------- */

const setup = loadSetup();

function loadSetup() {
  const fallback = {
    teams: DEFAULT_TEAMS.map((t) => ({ ...t, players: [...t.players] })),
    options: { roundsPerTeam: "3", drawMs: "75000", foldWidth: "normal", difficulties: "easy" },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETUP_KEY));
    if (saved?.teams?.length === 2)
      return { ...fallback, ...saved, options: { ...fallback.options, ...saved.options } };
  } catch {}
  return fallback;
}

function saveSetup() {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {}
}

function renderSetup() {
  const holder = $("[data-teams]");
  holder.replaceChildren(
    ...setup.teams.map((team, t) => {
      const card = document.createElement("div");
      card.className = "team-card";
      card.style.setProperty("--team", DEFAULT_TEAMS[t].color);
      const name = Object.assign(document.createElement("input"), {
        className: "team-name",
        value: team.name,
        maxLength: 24,
        ariaLabel: "Team name",
      });
      name.addEventListener("input", () => {
        team.name = name.value;
        saveSetup();
      });
      card.append(name);
      team.players.forEach((player, i) => {
        const row = document.createElement("div");
        row.className = "player-row";
        const input = Object.assign(document.createElement("input"), {
          value: player,
          maxLength: 20,
          ariaLabel: `${team.name} player ${i + 1}`,
        });
        input.addEventListener("input", () => {
          team.players[i] = input.value;
          saveSetup();
        });
        const remove = Object.assign(document.createElement("button"), {
          type: "button",
          textContent: "×",
          ariaLabel: `Remove ${player}`,
          disabled: team.players.length <= FOLDED.minPlayersPerTeam,
        });
        remove.addEventListener("click", () => {
          team.players.splice(i, 1);
          saveSetup();
          renderSetup();
        });
        row.append(input, remove);
        card.append(row);
      });
      if (team.players.length < FOLDED.maxPlayersPerTeam) {
        const add = Object.assign(document.createElement("button"), {
          type: "button",
          textContent: `+ ${LABELS.addPlayer}`,
        });
        add.addEventListener("click", () => {
          const count = setup.teams.reduce((n, tm) => n + tm.players.length, 0);
          team.players.push(`Player ${count + 1}`);
          saveSetup();
          renderSetup();
          $$("input", holder)
            .filter((el) => el.closest(".team-card") === holder.children[t])
            .at(-1)
            ?.select();
        });
        card.append(add);
      }
      return card;
    }),
  );
  for (const select of $$("[data-option]")) select.value = setup.options[select.dataset.option];
}

for (const select of $$("[data-option]")) {
  select.addEventListener("change", () => {
    setup.options[select.dataset.option] = select.value;
    saveSetup();
  });
}

function settingsFromSetup() {
  const o = setup.options;
  return {
    roundsPerTeam: Number(o.roundsPerTeam),
    drawMs: Number(o.drawMs),
    foldWidth: FOLDED.foldWidths[o.foldWidth] ?? FOLDED.foldWidth,
    difficulties: o.difficulties.split(","),
  };
}

function startGame() {
  unlockAudio();
  const result = match.dispatch(
    {
      type: EVENT.START_GAME,
      teams: setup.teams.map((t, i) => ({ ...t, color: DEFAULT_TEAMS[i].color })),
      settings: settingsFromSetup(),
    },
    now(),
  );
  text("[data-setup-error]", result.ok ? "" : LABELS.errors[result.error]);
  refresh();
}

$("[data-start]").addEventListener("click", startGame);
$("[data-again]").addEventListener("click", startGame);
$("[data-new-teams]").addEventListener("click", () => {
  shownKey = null;
  showScreen("setup");
  renderSetup();
});

/* ---------- Who's holding the device ---------- */

/** On one shared screen, the artist holds it while drawing and the
 * saboteur while folding; otherwise the whole room is looking. */
function viewerId() {
  const { round } = match.viewFor(null);
  if (!round) return null;
  if (match.phase === PHASE.DRAWING) return round.artist.id;
  if (match.phase === PHASE.SABOTAGE) return round.saboteur.id;
  return null;
}
const currentView = () => match.viewFor(viewerId());
const teamColor = (view, t) => view.teams[t]?.color ?? DEFAULT_TEAMS[t].color;

/* ---------- Paper canvas ---------- */

const paperSpace = $("[data-paper-space]");
const paperCanvas = $("[data-paper]");
const paperCtx = paperCanvas.getContext("2d");
let stopAnimation = null;
let animationFrame = null; // latest { highlight, close } while folding

const pad = createDrawingPad(paperCanvas, {
  ...PAPER,
  onChange(strokes) {
    if (match.phase !== PHASE.DRAWING) return;
    match.dispatch({ type: EVENT.SYNC_DRAWING, playerId: viewerId(), strokes }, now());
  },
});

const sabotage = createSabotageInput(paperCanvas, {
  paper: FOLDED.paper,
  onChange: renderPreview,
  onRelease({ fold, error }) {
    if (match.phase !== PHASE.SABOTAGE) return;
    if (error && !fold) {
      text("[data-hint]", LABELS.sabotageShortHint);
      return;
    }
    if (!fold) return;
    const result = match.dispatch(
      { type: EVENT.PREVIEW_FOLD, playerId: viewerId(), start: fold.start, end: fold.end },
      now(),
    );
    if (!result.ok) toast(LABELS.errors[result.error]);
    $("[data-confirm]").disabled = !result.ok;
    text("[data-hint]", LABELS.sabotageMoveHint);
    sfx.tap();
  },
});

function layoutPaper() {
  const rect = paperSpace.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const size = Math.max(140, Math.floor(Math.min(rect.width, rect.height) - 24));
  paperCanvas.style.width = paperCanvas.style.height = `${size}px`;
  const pixels = Math.min(1800, Math.round(size * Math.min(2, window.devicePixelRatio || 1)));
  if (paperCanvas.width !== pixels) {
    paperCanvas.width = paperCanvas.height = pixels;
  }
  renderStage();
}
new ResizeObserver(layoutPaper).observe(paperSpace);

/** The drawing on white paper at the main canvas's resolution, cached. */
const sourceCache = { strokes: null, size: 0, canvas: document.createElement("canvas"), folded: null, foldKey: "" };
function sourceFor(strokes) {
  const size = paperCanvas.width;
  if (sourceCache.strokes !== strokes || sourceCache.size !== size) {
    sourceCache.canvas.width = sourceCache.canvas.height = size;
    paintPaper(sourceCache.canvas, strokes, PAPER);
    sourceCache.strokes = strokes;
    sourceCache.size = size;
    sourceCache.folded = null;
  }
  return sourceCache.canvas;
}
function foldedFor(strokes, foldInfo) {
  const source = sourceFor(strokes);
  const key = JSON.stringify(foldInfo);
  if (!sourceCache.folded || sourceCache.foldKey !== key) {
    sourceCache.folded = foldedCanvas(source, FOLDED.paper, foldFromData(foldInfo));
    sourceCache.foldKey = key;
  }
  return sourceCache.folded;
}

function renderPreview(state = { fold: sabotage.fold }) {
  const { round } = currentView();
  if (match.phase !== PHASE.SABOTAGE || !round?.strokes) return;
  drawFoldPreview(paperCtx, sourceFor(round.strokes), FOLDED.paper, state);
}

function renderStage() {
  const { round } = currentView();
  switch (match.phase) {
    case PHASE.DRAWING:
      return pad.redraw();
    case PHASE.SABOTAGE:
      return renderPreview();
    case PHASE.FOLDING:
      if (animationFrame) {
        return drawFoldFrame(
          paperCtx,
          sourceFor(round.strokes),
          FOLDED.paper,
          foldFromData(round.fold),
          animationFrame,
        );
      }
      return drawFolded(paperCtx, foldedFor(round.strokes, round.fold), FOLDED.paper, foldFromData(round.fold));
    case PHASE.GUESSING:
      return drawFolded(paperCtx, foldedFor(round.strokes, round.fold), FOLDED.paper, foldFromData(round.fold));
    default:
      paintPaper(paperCanvas, [], PAPER);
  }
}

/* ---------- Phases ---------- */

function showScreen(name) {
  for (const screen of $$("[data-screen]")) screen.hidden = screen.dataset.screen !== name;
  if (name === "play") layoutPaper();
}

function showTools(name) {
  for (const tools of $$("[data-tools]")) tools.hidden = tools.dataset.tools !== name;
}

function showCover({ eyebrow, title, note, action, team, onAction }) {
  const cover = $("[data-cover]");
  cover.hidden = false;
  cover.style.setProperty("--team", team);
  text("[data-cover-eyebrow]", eyebrow);
  text("[data-cover-title]", title);
  text("[data-cover-note]", note);
  const button = $("[data-cover-action]");
  button.textContent = action;
  button.onclick = () => {
    unlockAudio();
    sfx.tap();
    onAction();
  };
  button.focus({ preventScroll: true });
}

function renderScores(holder, view, { gains, active } = {}) {
  holder.replaceChildren(
    ...view.teams.map((team, t) => {
      const pill = document.createElement("div");
      pill.className = "score";
      pill.classList.toggle("active", active === t);
      pill.style.setProperty("--team", teamColor(view, t));
      const name = Object.assign(document.createElement("span"), { textContent: team.name });
      const score = Object.assign(document.createElement("b"), { textContent: view.scores[t] });
      pill.append(name, score);
      if (gains?.[t])
        pill.append(Object.assign(document.createElement("span"), { className: "gain", textContent: `+${gains[t]}` }));
      return pill;
    }),
  );
}

function ready(playerId) {
  const result = match.dispatch({ type: EVENT.READY, playerId }, now());
  if (!result.ok) toast(LABELS.errors[result.error]);
  refresh();
}

/** Show whatever the controller's current phase needs. Runs once per
 * phase change. */
function enterPhase() {
  const view = currentView();
  const { round, phase } = view;
  stopAnimation?.();
  stopAnimation = null;
  animationFrame = null;
  pad.setEnabled(false);
  sabotage.setEnabled(false);
  paperCanvas.classList.remove("drawing", "thump");
  $("[data-cover]").hidden = true;
  $("[data-splash]").hidden = true;
  text("[data-splash-word]", "");
  $("[data-word-chip]").hidden = true;
  text("[data-word]", "");
  showTools(null);
  text("[data-hint]", "");

  if (phase === PHASE.SETUP) {
    showScreen("setup");
    renderSetup();
    return;
  }
  if (phase === PHASE.RESULTS) return showResults(view);
  if (phase === PHASE.GAME_OVER) return showGameOver(view);

  showScreen("play");
  text("[data-round-label]", `Round ${round.number} of ${view.totalRounds}`);
  renderScores($("[data-scores]"), view, { active: round.drawingTeam });
  const drawingTeam = view.teams[round.drawingTeam];
  const sabotageTeam = view.teams[round.sabotageTeam];
  const drawColor = teamColor(view, round.drawingTeam);
  const sabotageColor = teamColor(view, round.sabotageTeam);

  switch (phase) {
    case PHASE.ARTIST_HANDOFF:
      pad.reset();
      showCover({
        eyebrow: `${drawingTeam.name} draws`,
        title: LABELS.artistHandoff(round.artist.name),
        note: LABELS.artistHandoffNote(drawingTeam.name),
        action: LABELS.showWord(round.artist.name),
        team: drawColor,
        onAction: () => ready(round.artist.id),
      });
      break;

    case PHASE.DRAWING:
      pad.reset();
      pad.setEnabled(true);
      paperCanvas.classList.add("drawing");
      text("[data-word-label]", LABELS.yourWord);
      text("[data-word]", round.word);
      $("[data-word-chip]").hidden = false;
      text("[data-splash-label]", LABELS.yourWord);
      text("[data-splash-word]", round.word);
      $("[data-splash]").hidden = false;
      setTimeout(() => {
        $("[data-splash]").hidden = true;
        text("[data-splash-word]", "");
      }, 1800);
      text("[data-hint]", LABELS.drawHint);
      showTools("drawing");
      break;

    case PHASE.SABOTEUR_HANDOFF:
      showCover({
        eyebrow: round.drawTimedOut ? LABELS.timeUp : `${sabotageTeam.name} sabotages`,
        title: LABELS.saboteurHandoff(round.saboteur.name),
        note: LABELS.saboteurHandoffNote(drawingTeam.name),
        action: LABELS.startSabotage(round.saboteur.name),
        team: sabotageColor,
        onAction: () => ready(round.saboteur.id),
      });
      break;

    case PHASE.SABOTAGE:
      sabotage.reset({
        width: foldWidthFor(FOLDED.paper, view.settings.foldWidth),
        minDrag: minDragFor(FOLDED.paper, view.settings.minFoldDrag),
      });
      sabotage.setEnabled(true);
      paperCanvas.focus({ preventScroll: true });
      $("[data-confirm]").disabled = true;
      text("[data-hint]", LABELS.sabotageHint);
      showTools("sabotage");
      renderPreview({ fold: null });
      if (!hasInk(round.strokes)) toast(LABELS.blankDrawing);
      break;

    case PHASE.REVEAL_HANDOFF:
      showCover({
        eyebrow: round.sabotageTimedOut ? LABELS.timeUp : `${sabotageTeam.name} picked a fold`,
        title: LABELS.revealHandoff,
        note: LABELS.revealHandoffNote(round.saboteur.name),
        action: LABELS.reveal,
        team: sabotageColor,
        onAction: () => ready(null),
      });
      break;

    case PHASE.FOLDING:
      playFold(view);
      break;

    case PHASE.GUESSING:
      renderStage();
      showGuessing(view);
      break;
  }
}

function playFold(view) {
  const { round, settings } = view;
  const fold = foldFromData(round.fold);
  const source = sourceFor(round.strokes);
  foldedFor(round.strokes, round.fold); // ready before the last frame
  text("[data-hint]", "");
  sfx.crease();
  setTimeout(() => match.phase === PHASE.FOLDING && sfx.fold(), settings.foldAnimationMs * 0.25);
  stopAnimation = animateFold({
    duration: settings.foldAnimationMs,
    onFrame(state) {
      animationFrame = state;
      drawFoldFrame(paperCtx, sourceFor(round.strokes) || source, FOLDED.paper, fold, state);
    },
    onClosed() {
      sfx.snap();
      paperCanvas.classList.remove("thump");
      void paperCanvas.offsetWidth;
      paperCanvas.classList.add("thump");
    },
    onDone() {
      animationFrame = null;
      stopAnimation = null;
      renderStage();
      text("[data-hint]", LABELS.whatIsIt(view.teams[round.drawingTeam].name));
    },
  });
}

/* ---------- Guessing ---------- */

let guesserId = null;

function showGuessing(view) {
  const { round, teams } = view;
  const team = teams[round.drawingTeam];
  const eligible = team.players.filter((p) => p.id !== round.artist.id);
  if (!eligible.some((p) => p.id === guesserId)) guesserId = eligible[0]?.id;
  const holder = $("[data-guessers]");
  holder.style.setProperty("--team", teamColor(view, round.drawingTeam));
  holder.replaceChildren(
    ...eligible.map((p) => {
      const chip = Object.assign(document.createElement("button"), { type: "button", textContent: p.name });
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(p.id === guesserId));
      chip.addEventListener("click", () => {
        guesserId = p.id;
        for (const other of holder.querySelectorAll("[role=radio]"))
          other.setAttribute("aria-checked", String(other === chip));
        $("[data-guess-input]").focus();
      });
      return chip;
    }),
    Object.assign(document.createElement("span"), {
      className: "artist-tag",
      textContent: `✏️ ${LABELS.guessHint(round.artist.name)}`,
    }),
  );
  $("[data-guess-input]").value = "";
  renderGuessLog(round.guesses, false);
  showTools("guessing");
  $("[data-guess-input]").focus({ preventScroll: true });
}

function renderGuessLog(guesses, fresh) {
  const log = $("[data-guess-log]");
  log.replaceChildren(
    ...guesses
      .filter((g) => !g.correct)
      .slice(-8)
      .map((g, i, list) => {
        const li = Object.assign(document.createElement("li"), { textContent: `${g.name}: ${g.text}` });
        if (fresh && i === list.length - 1) li.classList.add("fresh");
        return li;
      }),
  );
}

$("[data-tools=guessing]").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("[data-guess-input]");
  const result = match.dispatch({ type: EVENT.GUESS, playerId: guesserId, text: input.value }, now());
  if (!result.ok) {
    toast(LABELS.errors[result.error]);
    refresh();
    return;
  }
  input.value = "";
  if (result.correct) sfx.correct();
  else {
    sfx.wrong();
    renderGuessLog(currentView().round.guesses, true);
  }
  refresh();
});
$("[data-give-up]").addEventListener("click", () => {
  match.dispatch({ type: EVENT.GIVE_UP, playerId: guesserId }, now());
  refresh();
});

/* ---------- Drawing and sabotage buttons ---------- */

$("[data-undo]").addEventListener("click", () => pad.undo());
$("[data-clear]").addEventListener("click", () => pad.clear());
$("[data-submit]").addEventListener("click", () => {
  pad.end();
  match.dispatch({ type: EVENT.SUBMIT_DRAWING, playerId: viewerId(), strokes: pad.strokes }, now());
  sfx.tap();
  refresh();
});
$("[data-confirm]").addEventListener("click", () => {
  const result = match.dispatch({ type: EVENT.CONFIRM_FOLD, playerId: viewerId() }, now());
  if (!result.ok) toast(LABELS.errors[result.error]);
  refresh();
});
document.addEventListener("keydown", (event) => {
  if (match.phase === PHASE.DRAWING && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    pad.undo();
  } else if (match.phase === PHASE.SABOTAGE && event.key === "Enter" && !$("[data-confirm]").disabled) {
    event.preventDefault();
    $("[data-confirm]").click();
  }
});

/* ---------- Results ---------- */

/** Before and after, each on its own canvas sized to fit its box. */
function paintPair(before, after, strokes, foldInfo) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const canvas of [before, after]) {
    const size = Math.round(canvas.getBoundingClientRect().width * dpr) || 300;
    canvas.width = canvas.height = size;
  }
  paintPaper(before, strokes, PAPER);
  const source = document.createElement("canvas");
  source.width = source.height = after.width;
  paintPaper(source, strokes, PAPER);
  const fold = foldFromData(foldInfo);
  drawFolded(after.getContext("2d"), foldedCanvas(source, FOLDED.paper, fold), FOLDED.paper, fold);
}

function showResults(view) {
  showScreen("results");
  const { round, teams } = view;
  const guessed = round.outcome === OUTCOME.GUESSED;
  const outcome = $("[data-outcome]");
  outcome.textContent = guessed
    ? LABELS.outcome.guessed(teams[round.drawingTeam].name)
    : LABELS.outcome.stumped(teams[round.sabotageTeam].name);
  outcome.classList.toggle("guessed", guessed);
  text(
    "[data-result-eyebrow]",
    guessed ? LABELS.guessedBy(round.guessedBy?.name) : LABELS.foldedBy(round.saboteur.name),
  );
  text("[data-answer]", round.word);
  renderScores($("[data-result-scores]"), view, { gains: round.points });
  const last = round.number >= view.totalRounds;
  const next = $("[data-next]");
  next.textContent = last ? LABELS.finalScores : LABELS.nextDraws(teams[round.sabotageTeam].name);
  next.focus({ preventScroll: true });
  paintPair($("[data-before]"), $("[data-after]"), round.strokes, round.fold);
  if (!guessed) sfx.stumped();
}

$("[data-next]").addEventListener("click", () => {
  match.dispatch({ type: EVENT.NEXT_ROUND }, now());
  refresh();
});

function showGameOver(view) {
  showScreen("over");
  const [a, b] = view.scores;
  text("[data-winner]", a === b ? LABELS.tie : LABELS.winner(view.teams[a > b ? 0 : 1].name));
  renderScores($("[data-final-scores]"), view, { active: a === b ? undefined : a > b ? 0 : 1 });
  const gallery = $("[data-gallery]");
  gallery.replaceChildren(
    ...view.history.map((h) => {
      const item = document.createElement("figure");
      item.className = "gallery-item";
      item.style.setProperty("--team", teamColor(view, h.drawingTeam));
      const thumbs = document.createElement("div");
      thumbs.className = "thumbs";
      const before = document.createElement("canvas");
      const after = document.createElement("canvas");
      thumbs.append(before, after);
      const artist = view.teams[h.drawingTeam].players.find((p) => p.id === h.artistId)?.name;
      item.append(
        Object.assign(document.createElement("strong"), { textContent: h.word }),
        thumbs,
        Object.assign(document.createElement("small"), {
          textContent: `Drawn by ${artist} · ${h.outcome === OUTCOME.GUESSED ? "guessed" : "stumped"}`,
        }),
      );
      return item;
    }),
  );
  // Paint after layout so each canvas knows its size.
  requestAnimationFrame(() =>
    $$(".gallery-item", gallery).forEach((item, i) => {
      const [before, after] = item.querySelectorAll("canvas");
      paintPair(before, after, view.history[i].strokes, view.history[i].fold);
    }),
  );
  $("[data-again]").focus({ preventScroll: true });
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (match.phase === PHASE.RESULTS)
      paintPair($("[data-before]"), $("[data-after]"), currentView().round.strokes, currentView().round.fold);
  }, 150);
});

/* ---------- Clock, toasts and the main loop ---------- */

let lastSecond = null;
function updateClock(at) {
  const clock = $("[data-clock]");
  const remaining = match.remainingMs(at);
  if (!TIMED_PHASES[match.phase] || remaining === null) {
    clock.hidden = true;
    return;
  }
  clock.hidden = false;
  const seconds = Math.ceil(remaining / 1000);
  clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const urgent = remaining <= FOLDED.urgentMs;
  clock.classList.toggle("urgent", urgent);
  if (urgent && seconds !== lastSecond && seconds <= 5 && seconds > 0) sfx.tick();
  lastSecond = seconds;
}

let toastTimer;
function toast(message) {
  const el = $("[data-toast]");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

function refresh() {
  const view = match.viewFor(null);
  const key = `${view.phase}:${view.round?.number ?? view.roundNumber}`;
  if (key !== shownKey) {
    shownKey = key;
    enterPhase();
  }
}

function step() {
  const at = now();
  // Finish an in-progress stroke just before the drawing clock runs out,
  // so it's part of the drawing that gets auto-submitted.
  if (match.phase === PHASE.DRAWING && match.remainingMs(at) <= 300) pad.setEnabled(false);
  match.tick(at);
  refresh();
  updateClock(at);
}
function loop() {
  step();
  requestAnimationFrame(loop);
}
// Animation frames pause in background tabs; the game clock shouldn't.
setInterval(step, 250);

/* ---------- Sound toggle ---------- */

const mute = $("[data-mute]");
const showMute = () => {
  mute.setAttribute("aria-pressed", String(isMuted()));
  mute.ariaLabel = isMuted() ? "Unmute sound" : "Mute sound";
};
mute.addEventListener("click", () => {
  setMuted(!isMuted());
  unlockAudio();
  showMute();
});
showMute();
document.addEventListener("pointerdown", unlockAudio, { once: true });

renderSetup();
refresh();
requestAnimationFrame(loop);
