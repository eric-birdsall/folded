import assert from "node:assert/strict";
import test from "node:test";
import { ERROR, EVENT, FOLDED, OUTCOME, PHASE, ROLE } from "../shared/config.js";
import { createMatch } from "../shared/game.js";
import { isCorrectGuess, normalizeGuess } from "../shared/guess.js";
import { createWordPicker, promptsFor } from "../shared/words.js";

const TEAMS = [
  { name: "Sun", players: ["Ann", "Bo", "Cy"] },
  { name: "Sky", players: ["Di", "Ed"] },
];
const STROKES = [
  {
    points: [
      { x: 100, y: 100 },
      { x: 900, y: 900 },
    ],
  },
];

/** A seeded random so word picks and fallbacks repeat. */
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function start(settings = {}) {
  const match = createMatch({ random: seeded(7) });
  assert.deepEqual(match.dispatch({ type: EVENT.START_GAME, teams: TEAMS, settings }, 0), { ok: true });
  return match;
}

const roundOf = (match) => match.viewFor(null).round;
const artistId = (match) => roundOf(match).artist.id;
const saboteurId = (match) => roundOf(match).saboteur.id;
const secretWord = (match) => match.viewFor(artistId(match)).round.word;

/** Play a round up to guessing. Returns the time guessing began. */
function toGuessing(match, at = 0) {
  const artist = artistId(match);
  const saboteur = saboteurId(match);
  assert.ok(match.dispatch({ type: EVENT.READY, playerId: artist }, at).ok);
  assert.ok(match.dispatch({ type: EVENT.SUBMIT_DRAWING, playerId: artist, strokes: STROKES }, at + 1000).ok);
  assert.ok(match.dispatch({ type: EVENT.READY, playerId: saboteur }, at + 2000).ok);
  const fold = { start: { x: 0, y: 500 }, end: { x: 1000, y: 500 } };
  assert.ok(match.dispatch({ type: EVENT.CONFIRM_FOLD, playerId: saboteur, ...fold }, at + 3000).ok);
  assert.ok(match.dispatch({ type: EVENT.READY }, at + 4000).ok);
  assert.equal(match.phase, PHASE.FOLDING);
  const guessingAt = at + 4000 + FOLDED.foldAnimationMs + FOLDED.reactMs;
  match.tick(guessingAt);
  assert.equal(match.phase, PHASE.GUESSING);
  return guessingAt;
}

const guesser = (match) => {
  const { round, teams } = match.viewFor(null);
  return teams[round.drawingTeam].players.find((p) => p.id !== round.artist.id).id;
};

test("guesses ignore case, spacing, punctuation, articles and plurals", () => {
  assert.equal(normalizeGuess("  The   GIRAFFE!! "), "giraffe");
  assert.equal(normalizeGuess("hot-dog"), "hot dog");
  assert.ok(isCorrectGuess("Giraffe.", ["giraffe"]));
  assert.ok(isCorrectGuess("a giraffe", ["giraffe"]));
  assert.ok(isCorrectGuess("giraffes", ["giraffe"]));
  assert.ok(isCorrectGuess("HOTDOG", ["hot dog"]));
  assert.ok(isCorrectGuess("plane", ["airplane", "plane"]));
  assert.ok(isCorrectGuess("bunnies", ["bunny"]));
  assert.ok(isCorrectGuess("Crème brûlée", ["creme brulee"]));
  assert.ok(!isCorrectGuess("giraf", ["giraffe"]));
  assert.ok(!isCorrectGuess("", ["giraffe"]));
  assert.ok(!isCorrectGuess("   !!", ["giraffe"]));
  assert.ok(!isCorrectGuess("elephant", ["giraffe"]));
});

test("the word picker doesn't repeat until the pool runs out", () => {
  const pool = promptsFor(["vehicles"], ["easy"]);
  const pick = createWordPicker({ categories: ["vehicles"], difficulties: ["easy"], random: seeded(3) });
  const words = pool.map(() => pick().word);
  assert.equal(new Set(words).size, pool.length);
  assert.ok(pool.find((p) => p.word === "airplane").answers.includes("plane"));
});

test("setup needs two teams of at least two", () => {
  const match = createMatch();
  const bad = match.dispatch({ type: EVENT.START_GAME, teams: [{ players: ["A"] }, { players: ["B", "C"] }] }, 0);
  assert.deepEqual(bad, { ok: false, error: ERROR.BAD_TEAMS });
  assert.equal(match.phase, PHASE.SETUP);
  assert.equal(match.dispatch({ type: "nonsense" }, 0).error, ERROR.UNKNOWN_EVENT);
});

test("only the artist sees the word, and only after taking the device", () => {
  const match = start();
  const view = (id) => match.viewFor(id).round.word;
  const artist = artistId(match);
  assert.equal(view(artist), null, "not even the artist before the handoff");
  match.dispatch({ type: EVENT.READY, playerId: artist }, 0);
  const word = view(artist);
  assert.ok(word);
  for (const id of ["t0p0", "t0p1", "t0p2", "t1p0", "t1p1", null].filter((id) => id !== artist)) {
    assert.equal(view(id), null);
    assert.ok(!JSON.stringify(match.viewFor(id)).includes(`"${word}"`), "the word isn't anywhere in the view");
  }
});

test("the drawing stays hidden from the guessers until the fold", () => {
  const match = start();
  const artist = artistId(match);
  const guesserId = guesser(match);
  match.dispatch({ type: EVENT.READY, playerId: artist }, 0);
  match.dispatch({ type: EVENT.SUBMIT_DRAWING, playerId: artist, strokes: STROKES }, 10);
  assert.equal(match.viewFor(guesserId).round.strokes, null);
  match.dispatch({ type: EVENT.READY, playerId: saboteurId(match) }, 20);
  assert.ok(match.viewFor(saboteurId(match)).round.strokes.length);
  assert.equal(match.viewFor(guesserId).round.strokes, null);
  assert.equal(match.viewFor(null).round.strokes, null);
});

test("actions from the wrong role or phase are rejected and change nothing", () => {
  const match = start();
  const artist = artistId(match);
  const saboteur = saboteurId(match);
  const g = guesser(match);
  const err = (action, at = 0) => match.dispatch(action, at).error;
  assert.equal(err({ type: EVENT.READY, playerId: g }), ERROR.NOT_YOUR_ROLE);
  assert.equal(err({ type: EVENT.SUBMIT_DRAWING, playerId: artist }), ERROR.WRONG_PHASE);
  assert.equal(err({ type: EVENT.GUESS, playerId: g, text: "x" }), ERROR.WRONG_PHASE);
  match.dispatch({ type: EVENT.READY, playerId: artist }, 0);
  assert.equal(err({ type: EVENT.SUBMIT_DRAWING, playerId: g, strokes: STROKES }), ERROR.NOT_YOUR_ROLE);
  assert.equal(err({ type: EVENT.SUBMIT_DRAWING, playerId: "t9p9" }), ERROR.UNKNOWN_PLAYER);
  assert.equal(err({ type: EVENT.PREVIEW_FOLD, playerId: saboteur }), ERROR.WRONG_PHASE);
  assert.equal(match.phase, PHASE.DRAWING);
  match.dispatch({ type: EVENT.SUBMIT_DRAWING, playerId: artist, strokes: STROKES }, 0);
  match.dispatch({ type: EVENT.READY, playerId: saboteur }, 0);
  assert.equal(err({ type: EVENT.CONFIRM_FOLD, playerId: g }), ERROR.NOT_YOUR_ROLE);
  assert.equal(err({ type: EVENT.CONFIRM_FOLD, playerId: saboteur }), ERROR.NO_FOLD);
  const tooShort = { start: { x: 500, y: 500 }, end: { x: 503, y: 501 } };
  assert.equal(err({ type: EVENT.PREVIEW_FOLD, playerId: saboteur, ...tooShort }), ERROR.FOLD_TOO_SHORT);
  const offPaper = { start: { x: -400, y: -10 }, end: { x: -400, y: 900 } };
  assert.equal(err({ type: EVENT.CONFIRM_FOLD, playerId: saboteur, ...offPaper }), ERROR.FOLD_MISSES_PAPER);
  assert.equal(match.phase, PHASE.SABOTAGE);
  const good = { start: { x: 100, y: 400 }, end: { x: 800, y: 450 } };
  assert.ok(match.dispatch({ type: EVENT.CONFIRM_FOLD, playerId: saboteur, ...good }, 0).ok);
  assert.equal(err({ type: EVENT.CONFIRM_FOLD, playerId: saboteur, ...good }), ERROR.WRONG_PHASE, "one fold only");
  match.dispatch({ type: EVENT.READY }, 0);
  match.tick(10_000);
  // The artist and the other team can't guess.
  assert.equal(err({ type: EVENT.GUESS, playerId: artist, text: secretWord(match) }, 10_000), ERROR.NOT_YOUR_ROLE);
  assert.equal(err({ type: EVENT.GUESS, playerId: saboteur, text: "x" }, 10_000), ERROR.NOT_YOUR_ROLE);
  assert.equal(err({ type: EVENT.GUESS, playerId: g, text: "  ?! " }, 10_000), ERROR.EMPTY_GUESS);
  assert.equal(match.viewFor(null).round.guesses.length, 0);
});

test("a correct guess ends the round at once and scores the drawing team", () => {
  const match = start();
  const at = toGuessing(match);
  const word = secretWord(match);
  const g = guesser(match);
  const wrong = match.dispatch({ type: EVENT.GUESS, playerId: g, text: "definitely not it" }, at + 1000);
  assert.deepEqual(wrong, { ok: true, correct: false });
  assert.equal(match.phase, PHASE.GUESSING);
  const right = match.dispatch({ type: EVENT.GUESS, playerId: g, text: ` ${word.toUpperCase()}! ` }, at + 2000);
  assert.deepEqual(right, { ok: true, correct: true });
  assert.equal(match.phase, PHASE.RESULTS);
  const view = match.viewFor(null);
  assert.equal(view.round.outcome, OUTCOME.GUESSED);
  assert.equal(view.round.word, word, "the answer is shown to everyone after the round");
  assert.equal(view.round.guessedBy.id, g);
  const { correct, quickBonus } = FOLDED.scoring;
  assert.deepEqual(view.scores, [correct + quickBonus, 0]);
  assert.ok(view.round.fold && view.round.strokes.length, "results have both drawings");
});

test("timers: drawing auto-submits, sabotage commits the preview, guessing runs out", () => {
  const match = start();
  const artist = artistId(match);
  const saboteur = saboteurId(match);
  match.dispatch({ type: EVENT.READY, playerId: artist }, 0);
  match.dispatch({ type: EVENT.SYNC_DRAWING, playerId: artist, strokes: STROKES }, 500);
  match.tick(FOLDED.drawMs - 1);
  assert.equal(match.phase, PHASE.DRAWING);
  match.tick(FOLDED.drawMs);
  assert.equal(match.phase, PHASE.SABOTEUR_HANDOFF);
  assert.deepEqual(match.viewFor(artist).round.strokes, STROKES);
  assert.ok(match.viewFor(artist).round.drawTimedOut);

  let t = FOLDED.drawMs + 100;
  match.dispatch({ type: EVENT.READY, playerId: saboteur }, t);
  const preview = { start: { x: 100, y: 100 }, end: { x: 900, y: 300 } };
  match.dispatch({ type: EVENT.PREVIEW_FOLD, playerId: saboteur, ...preview }, t + 10);
  match.tick(t + FOLDED.sabotageMs);
  assert.equal(match.phase, PHASE.REVEAL_HANDOFF);
  const fold = match.viewFor(saboteur).round.fold;
  assert.deepEqual([fold.start, fold.end], [preview.start, preview.end]);

  t += FOLDED.sabotageMs + 100;
  match.dispatch({ type: EVENT.READY }, t);
  match.tick(t + FOLDED.foldAnimationMs + FOLDED.reactMs);
  assert.equal(match.phase, PHASE.GUESSING);
  // A guess sent after the clock ran out loses to the clock.
  const late = t + FOLDED.foldAnimationMs + FOLDED.reactMs + FOLDED.guessMs;
  const result = match.dispatch({ type: EVENT.GUESS, playerId: guesser(match), text: "x" }, late);
  assert.equal(result.error, ERROR.WRONG_PHASE);
  const view = match.viewFor(null);
  assert.equal(view.round.outcome, OUTCOME.STUMPED);
  assert.deepEqual(view.scores, [0, FOLDED.scoring.stumped]);
});

test("with no preview, a sabotage timeout makes a fallback fold through the ink", () => {
  const match = start();
  const artist = artistId(match);
  match.dispatch({ type: EVENT.READY, playerId: artist }, 0);
  match.dispatch({ type: EVENT.SUBMIT_DRAWING, playerId: artist, strokes: [] }, 0);
  match.dispatch({ type: EVENT.READY, playerId: saboteurId(match) }, 0);
  match.tick(FOLDED.sabotageMs);
  const { fold, sabotageTimedOut } = match.viewFor(saboteurId(match)).round;
  assert.ok(fold && sabotageTimedOut, "even a blank page gets folded");
});

test("teams swap roles each round, artists and saboteurs rotate, and the game ends", () => {
  const match = start({ roundsPerTeam: 3 });
  const seen = [];
  for (let r = 0; r < 6; r++) {
    const { round } = match.viewFor(null);
    seen.push([round.drawingTeam, round.artist.id, round.saboteur.id]);
    const at = toGuessing(match, r * 1_000_000);
    match.dispatch({ type: EVENT.GIVE_UP, playerId: guesser(match) }, at + 10);
    assert.equal(match.phase, PHASE.RESULTS);
    match.dispatch({ type: EVENT.NEXT_ROUND }, at + 20);
  }
  assert.deepEqual(
    seen.map(([team]) => team),
    [0, 1, 0, 1, 0, 1],
  );
  // Sun has 3 players and draws 3 times: everyone gets a turn.
  assert.deepEqual(
    seen.filter(([team]) => team === 0).map(([, artist]) => artist),
    ["t0p0", "t0p1", "t0p2"],
  );
  // Sky has 2: its artists and saboteurs wrap around.
  assert.deepEqual(
    seen.filter(([team]) => team === 1).map(([, artist]) => artist),
    ["t1p0", "t1p1", "t1p0"],
  );
  assert.deepEqual(
    seen.filter(([team]) => team === 0).map(([, , saboteur]) => saboteur),
    ["t1p0", "t1p1", "t1p0"],
  );
  assert.equal(match.phase, PHASE.GAME_OVER);
  const view = match.viewFor(null);
  assert.equal(view.history.length, 6);
  assert.deepEqual(view.scores, [3 * FOLDED.scoring.stumped, 3 * FOLDED.scoring.stumped]);
  assert.equal(new Set(view.history.map((h) => h.word)).size, 6, "no repeated words");
  // And a new game can start straight away.
  assert.ok(match.dispatch({ type: EVENT.START_GAME, teams: TEAMS }, 0).ok);
  assert.equal(match.phase, PHASE.ARTIST_HANDOFF);
  assert.deepEqual(match.viewFor(null).scores, [0, 0]);
});

test("settings override the config, but only with sensible values", () => {
  const match = start({ guessMs: 5000, foldWidth: 0.24, drawMs: "lots", categories: [] });
  const { settings } = match.viewFor(null);
  assert.equal(settings.guessMs, 5000);
  assert.equal(settings.foldWidth, 0.24);
  assert.equal(settings.drawMs, FOLDED.drawMs);
  assert.deepEqual(settings.categories, FOLDED.categories);
  assert.equal(match.viewFor("t0p0").role === ROLE.ARTIST, artistId(match) === "t0p0");
});
