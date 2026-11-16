/* The authoritative game controller. It owns the phase, timers, word,
 * roles, drawing, fold, guesses and scores, and checks every action
 * against the current phase and the actor's role. It never touches the DOM
 * and takes time as an argument, so tests can drive it exactly.
 *
 * Folded is a same-room, one-device game (like Drunk Drawing), so the
 * screen changes hands. The UI asks `viewFor(playerId)` for exactly what the
 * person holding the device may see: the word only ever leaves this module
 * in the artist's view or after the round. A networked version would send
 * each client its own `viewFor`. */

import { ERROR, EVENT, FOLDED, OUTCOME, PHASE, ROLE, ROTATION, SABOTAGE_TIMEOUT, TIMED_PHASES } from "./config.js";
import { cleanStrokes, inkBounds } from "./drawing.js";
import { createFold, fallbackFold, foldData, foldWidthFor, minDragFor } from "./foldGeometry.js";
import { isCorrectGuess, normalizeGuess } from "./guess.js";
import { createWordPicker } from "./words.js";

/** Settings a game may override, checked against FOLDED's types. */
const SETTING_KEYS = [
  "drawMs",
  "sabotageMs",
  "guessMs",
  "foldWidth",
  "roundsPerTeam",
  "rotation",
  "sabotageTimeout",
  "categories",
  "difficulties",
];

export function mergeSettings(base, settings = {}) {
  const merged = { ...base };
  for (const key of SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    if (Array.isArray(base[key]) ? Array.isArray(value) && value.length : typeof value === typeof base[key]) {
      merged[key] = value;
    }
  }
  return Object.freeze(merged);
}

const ok = () => ({ ok: true });
const fail = (error) => ({ ok: false, error });

/** Visible to everyone once a round is over. */
const ROUND_OVER = new Set([PHASE.RESULTS, PHASE.GAME_OVER]);
/** When each audience may see the drawing. */
const DRAWING_VISIBLE = {
  [ROLE.ARTIST]: new Set([
    PHASE.DRAWING,
    PHASE.SABOTEUR_HANDOFF,
    PHASE.SABOTAGE,
    PHASE.REVEAL_HANDOFF,
    PHASE.FOLDING,
    PHASE.GUESSING,
  ]),
  [ROLE.SABOTEUR]: new Set([PHASE.SABOTAGE, PHASE.REVEAL_HANDOFF, PHASE.FOLDING, PHASE.GUESSING]),
  [ROLE.SABOTEUR_TEAM]: new Set([PHASE.SABOTAGE, PHASE.REVEAL_HANDOFF, PHASE.FOLDING, PHASE.GUESSING]),
  [ROLE.GUESSER]: new Set([PHASE.FOLDING, PHASE.GUESSING]),
  [ROLE.ROOM]: new Set([PHASE.FOLDING, PHASE.GUESSING]),
};

export function createMatch({ config = FOLDED, random = Math.random } = {}) {
  let settings = config;
  let phase = PHASE.SETUP;
  let teams = [];
  let scores = [0, 0];
  let order = [[], []];
  let turns = { artist: [0, 0], saboteur: [0, 0] };
  let roundIndex = 0;
  let round = null;
  let deadline = null;
  let history = [];
  let pickWord = null;

  const totalRounds = () => settings.roundsPerTeam * 2;
  const player = (id) => teams.flatMap((t) => t.players).find((p) => p.id === id);
  const teamOf = (id) => teams.findIndex((t) => t.players.some((p) => p.id === id));
  const paper = () => settings.paper;
  const foldWidth = () => foldWidthFor(paper(), settings.foldWidth);

  function roleOf(id) {
    if (!round || !player(id)) return ROLE.ROOM;
    if (id === round.artistId) return ROLE.ARTIST;
    if (id === round.saboteurId) return ROLE.SABOTEUR;
    return teamOf(id) === round.drawingTeam ? ROLE.GUESSER : ROLE.SABOTEUR_TEAM;
  }

  function enter(next, at) {
    phase = next;
    const lengthKey = TIMED_PHASES[next];
    if (lengthKey) deadline = at + settings[lengthKey];
    else if (next === PHASE.FOLDING) deadline = at + settings.foldAnimationMs + settings.reactMs;
    else deadline = null;
  }

  function startRound() {
    const drawingTeam = roundIndex % 2;
    const sabotageTeam = 1 - drawingTeam;
    const pick = (team, kind) => order[team][turns[kind][team] % order[team].length];
    const prompt = pickWord();
    round = {
      number: roundIndex + 1,
      drawingTeam,
      sabotageTeam,
      artistId: pick(drawingTeam, "artist"),
      saboteurId: pick(sabotageTeam, "saboteur"),
      prompt,
      draft: [],
      strokes: null,
      previewFold: null,
      fold: null,
      drawTimedOut: false,
      sabotageTimedOut: false,
      guesses: [],
      outcome: null,
      guessedBy: null,
      points: [0, 0],
    };
    enter(PHASE.ARTIST_HANDOFF);
  }

  function submitDrawing(strokes, timedOut) {
    round.strokes = cleanStrokes(strokes, paper());
    round.drawTimedOut = timedOut;
  }

  function lockFold(fold, timedOut) {
    round.fold = foldData(fold);
    round.previewFold = null;
    round.sabotageTimedOut = timedOut;
  }

  function finishRound(outcome, at, guessedBy = null) {
    const { scoring } = settings;
    round.outcome = outcome;
    round.guessedBy = guessedBy;
    if (outcome === OUTCOME.GUESSED) {
      const quick = deadline - at >= settings.guessMs / 2;
      round.points[round.drawingTeam] = scoring.correct + (quick ? scoring.quickBonus : 0);
    } else {
      round.points[round.sabotageTeam] = scoring.stumped;
    }
    scores = scores.map((score, i) => score + round.points[i]);
    turns.artist[round.drawingTeam] += 1;
    turns.saboteur[round.sabotageTeam] += 1;
    history.push(summary(round));
    enter(PHASE.RESULTS);
  }

  function summary(r) {
    return {
      number: r.number,
      word: r.prompt.word,
      drawingTeam: r.drawingTeam,
      artistId: r.artistId,
      saboteurId: r.saboteurId,
      strokes: r.strokes,
      fold: r.fold,
      outcome: r.outcome,
      guessedBy: r.guessedBy,
      points: [...r.points],
    };
  }

  function startGame(action, at) {
    const cleaned = (action.teams || []).slice(0, 2).map((team, t) => ({
      name: String(team.name || `Team ${t + 1}`).slice(0, 24),
      color: team.color,
      players: (team.players || [])
        .map((name) =>
          String(name ?? "")
            .trim()
            .slice(0, 20),
        )
        .filter(Boolean)
        .slice(0, config.maxPlayersPerTeam)
        .map((name, i) => ({ id: `t${t}p${i}`, name })),
    }));
    if (cleaned.length !== 2 || cleaned.some((t) => t.players.length < config.minPlayersPerTeam)) {
      return fail(ERROR.BAD_TEAMS);
    }
    settings = mergeSettings(config, action.settings);
    teams = cleaned;
    scores = [0, 0];
    turns = { artist: [0, 0], saboteur: [0, 0] };
    order = teams.map((team) => {
      const ids = team.players.map((p) => p.id);
      return settings.rotation === ROTATION.RANDOM ? shuffle(ids, random) : ids;
    });
    history = [];
    roundIndex = 0;
    pickWord = createWordPicker({
      categories: settings.categories,
      difficulties: settings.difficulties,
      random,
    });
    startRound(at);
    return ok();
  }

  /** Each event: the phases it's allowed in, who may send it, and what it does. */
  const handlers = {
    [EVENT.START_GAME]: {
      phases: [PHASE.SETUP, PHASE.GAME_OVER, PHASE.RESULTS],
      roles: null,
      run: startGame,
    },
    [EVENT.READY]: {
      phases: [PHASE.ARTIST_HANDOFF, PHASE.SABOTEUR_HANDOFF, PHASE.REVEAL_HANDOFF],
      roles: null,
      run(action, at) {
        const needed = { [PHASE.ARTIST_HANDOFF]: ROLE.ARTIST, [PHASE.SABOTEUR_HANDOFF]: ROLE.SABOTEUR }[phase];
        if (needed && roleOf(action.playerId) !== needed) return fail(ERROR.NOT_YOUR_ROLE);
        const next = {
          [PHASE.ARTIST_HANDOFF]: PHASE.DRAWING,
          [PHASE.SABOTEUR_HANDOFF]: PHASE.SABOTAGE,
          [PHASE.REVEAL_HANDOFF]: PHASE.FOLDING,
        }[phase];
        enter(next, at);
        return ok();
      },
    },
    [EVENT.SYNC_DRAWING]: {
      phases: [PHASE.DRAWING],
      roles: [ROLE.ARTIST],
      run(action) {
        round.draft = cleanStrokes(action.strokes, paper());
        return ok();
      },
    },
    [EVENT.SUBMIT_DRAWING]: {
      phases: [PHASE.DRAWING],
      roles: [ROLE.ARTIST],
      run(action, at) {
        submitDrawing(action.strokes ?? round.draft, false);
        enter(PHASE.SABOTEUR_HANDOFF, at);
        return ok();
      },
    },
    [EVENT.PREVIEW_FOLD]: {
      phases: [PHASE.SABOTAGE],
      roles: [ROLE.SABOTEUR],
      run(action) {
        const { fold, error } = makeFold(action);
        if (error) return fail(error);
        round.previewFold = foldData(fold);
        return ok();
      },
    },
    [EVENT.CONFIRM_FOLD]: {
      phases: [PHASE.SABOTAGE],
      roles: [ROLE.SABOTEUR],
      run(action, at) {
        const source = action.start ? action : round.previewFold;
        if (!source) return fail(ERROR.NO_FOLD);
        const { fold, error } = makeFold(source);
        if (error) return fail(error);
        lockFold(fold, false);
        enter(PHASE.REVEAL_HANDOFF, at);
        return ok();
      },
    },
    [EVENT.GUESS]: {
      phases: [PHASE.GUESSING],
      roles: [ROLE.GUESSER],
      run(action, at) {
        const text = String(action.text ?? "").slice(0, 60);
        if (!normalizeGuess(text)) return fail(ERROR.EMPTY_GUESS);
        const correct = isCorrectGuess(text, round.prompt.answers);
        round.guesses.push({ playerId: action.playerId, text: text.trim(), correct });
        if (correct) finishRound(OUTCOME.GUESSED, at, action.playerId);
        return { ok: true, correct };
      },
    },
    [EVENT.GIVE_UP]: {
      phases: [PHASE.GUESSING],
      roles: [ROLE.GUESSER],
      run(action, at) {
        finishRound(OUTCOME.STUMPED, at);
        return ok();
      },
    },
    [EVENT.NEXT_ROUND]: {
      phases: [PHASE.RESULTS],
      roles: null,
      run(action, at) {
        roundIndex += 1;
        if (roundIndex >= totalRounds()) {
          round = null;
          enter(PHASE.GAME_OVER, at);
        } else startRound(at);
        return ok();
      },
    },
  };

  function makeFold({ start, end }) {
    return createFold(start, end, {
      width: foldWidth(),
      minDrag: minDragFor(paper(), settings.minFoldDrag),
      paper: paper(),
    });
  }

  /** Apply one player action at time `at` (ms). Returns `{ ok }` or
   * `{ ok: false, error }`; a rejected action changes nothing. */
  function dispatch(action, at) {
    const handler = handlers[action?.type];
    if (!handler) return fail(ERROR.UNKNOWN_EVENT);
    tick(at);
    if (!handler.phases.includes(phase)) return fail(ERROR.WRONG_PHASE);
    if (handler.roles) {
      if (!player(action.playerId)) return fail(ERROR.UNKNOWN_PLAYER);
      if (!handler.roles.includes(roleOf(action.playerId))) return fail(ERROR.NOT_YOUR_ROLE);
    }
    return handler.run(action, at);
  }

  /** Advance on timers. Call every frame (and it's called before every
   * action, so a late action can't beat the clock). */
  function tick(at) {
    if (deadline === null || at < deadline) return;
    const due = deadline;
    if (phase === PHASE.DRAWING) {
      submitDrawing(round.draft, true);
      enter(PHASE.SABOTEUR_HANDOFF, due);
    } else if (phase === PHASE.SABOTAGE) {
      const preview = settings.sabotageTimeout === SABOTAGE_TIMEOUT.COMMIT_PREVIEW && round.previewFold;
      const fold = preview
        ? createFold(preview.start, preview.end, { width: preview.width }).fold
        : fallbackFold({ bounds: inkBounds(round.strokes), paper: paper(), width: foldWidth(), random });
      lockFold(fold, true);
      enter(PHASE.REVEAL_HANDOFF, due);
    } else if (phase === PHASE.FOLDING) {
      enter(PHASE.GUESSING, due);
    } else if (phase === PHASE.GUESSING) {
      finishRound(OUTCOME.STUMPED, due);
    }
  }

  /** What `playerId` may see right now. `null` is the whole room. */
  function viewFor(playerId = null) {
    const role = roleOf(playerId);
    const names = (id) => player(id)?.name ?? null;
    const view = {
      phase,
      role,
      deadline,
      settings,
      teams: teams.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p })) })),
      scores: [...scores],
      roundNumber: round?.number ?? roundIndex,
      totalRounds: totalRounds(),
      history: history.map((h) => ({ ...h, points: [...h.points] })),
      round: null,
    };
    if (!round) return view;
    const over = ROUND_OVER.has(phase);
    const seesDrawing = over || DRAWING_VISIBLE[role]?.has(phase);
    const seesWord = over || (role === ROLE.ARTIST && phase !== PHASE.ARTIST_HANDOFF);
    view.round = {
      number: round.number,
      drawingTeam: round.drawingTeam,
      sabotageTeam: round.sabotageTeam,
      artist: { id: round.artistId, name: names(round.artistId) },
      saboteur: { id: round.saboteurId, name: names(round.saboteurId) },
      word: seesWord ? round.prompt.word : null,
      strokes: seesDrawing ? (round.strokes ?? (role === ROLE.ARTIST ? round.draft : null)) : null,
      previewFold: role === ROLE.SABOTEUR ? round.previewFold : null,
      fold: seesDrawing && phase !== PHASE.SABOTAGE ? round.fold : null,
      drawTimedOut: round.drawTimedOut,
      sabotageTimedOut: round.sabotageTimedOut,
      guesses: round.guesses.map((g) => ({ ...g, name: names(g.playerId) })),
      outcome: round.outcome,
      guessedBy: round.guessedBy && { id: round.guessedBy, name: names(round.guessedBy) },
      points: [...round.points],
    };
    return view;
  }

  return {
    dispatch,
    tick,
    viewFor,
    /** Milliseconds left on the current phase's clock (null when untimed). */
    remainingMs(at) {
      return deadline === null ? null : Math.max(0, deadline - at);
    },
    get phase() {
      return phase;
    },
  };
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
