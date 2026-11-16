/* Every tunable number and every shared name for Folded lives here, so the
 * game controller, the UI, and the tests all agree. */

/** Gameplay tuning. Lengths are in paper units (the paper is
 * `paper.width` × `paper.height` units whatever its size on screen). */
export const FOLDED = Object.freeze({
  paper: Object.freeze({ width: 1000, height: 1000 }),
  pen: Object.freeze({ color: "#111111", width: 7 }),
  paperColor: "#ffffff",

  drawMs: 75_000,
  sabotageMs: 25_000,
  guessMs: 60_000,
  // The clock turns red for the last few seconds of every phase.
  urgentMs: 10_000,

  // Width of the strip that gets folded away, as a share of the paper's
  // shorter side. Settings offers a few presets.
  foldWidth: 0.16,
  foldWidths: Object.freeze({ thin: 0.1, normal: 0.16, chunky: 0.24 }),
  // Drags shorter than this share of the shorter side are ignored: they
  // can't set an angle reliably.
  minFoldDrag: 0.06,

  // Reveal: the fold animation, then a beat to react before guessing.
  foldAnimationMs: 1800,
  reactMs: 1400,

  // When the saboteur's clock runs out: commit the current preview if there
  // is one, otherwise make a fallback fold through the middle of the ink.
  // One of SABOTAGE_TIMEOUT.
  sabotageTimeout: "commit-preview",

  scoring: Object.freeze({
    // Drawing team, for guessing the word.
    correct: 3,
    // Extra point when they get it in the first half of the guessing time.
    quickBonus: 1,
    // Sabotaging team, when the drawing team doesn't get it.
    stumped: 2,
  }),

  // Each team draws this many times.
  roundsPerTeam: 3,
  // Artists and saboteurs take turns in team order; with "random" each team
  // shuffles its order once at the start of the game.
  rotation: "in-order",

  minPlayersPerTeam: 2,
  maxPlayersPerTeam: 8,

  categories: Object.freeze(["animals", "vehicles", "food", "things"]),
  difficulties: Object.freeze(["easy"]),
});

export const PHASE = Object.freeze({
  SETUP: "setup",
  ARTIST_HANDOFF: "artist-handoff",
  DRAWING: "drawing",
  SABOTEUR_HANDOFF: "saboteur-handoff",
  SABOTAGE: "sabotage",
  REVEAL_HANDOFF: "reveal-handoff",
  FOLDING: "folding",
  GUESSING: "guessing",
  RESULTS: "results",
  GAME_OVER: "game-over",
});

/** Phases with a running clock, and which config field sets its length. */
export const TIMED_PHASES = Object.freeze({
  [PHASE.DRAWING]: "drawMs",
  [PHASE.SABOTAGE]: "sabotageMs",
  [PHASE.GUESSING]: "guessMs",
});

export const ROLE = Object.freeze({
  ARTIST: "artist",
  GUESSER: "guesser",
  SABOTEUR: "saboteur",
  SABOTEUR_TEAM: "saboteur-team",
  ROOM: "room",
});

export const EVENT = Object.freeze({
  START_GAME: "start-game",
  READY: "ready",
  SYNC_DRAWING: "sync-drawing",
  SUBMIT_DRAWING: "submit-drawing",
  PREVIEW_FOLD: "preview-fold",
  CONFIRM_FOLD: "confirm-fold",
  GUESS: "guess",
  GIVE_UP: "give-up",
  NEXT_ROUND: "next-round",
});

export const OUTCOME = Object.freeze({
  GUESSED: "guessed",
  STUMPED: "stumped",
});

export const ERROR = Object.freeze({
  WRONG_PHASE: "wrong-phase",
  NOT_YOUR_ROLE: "not-your-role",
  UNKNOWN_PLAYER: "unknown-player",
  BAD_TEAMS: "bad-teams",
  FOLD_TOO_SHORT: "fold-too-short",
  FOLD_MISSES_PAPER: "fold-misses-paper",
  NO_FOLD: "no-fold",
  EMPTY_GUESS: "empty-guess",
  UNKNOWN_EVENT: "unknown-event",
});

export const SABOTAGE_TIMEOUT = Object.freeze({
  COMMIT_PREVIEW: "commit-preview",
  FALLBACK: "fallback",
});

export const ROTATION = Object.freeze({ IN_ORDER: "in-order", RANDOM: "random" });

/** Every line of on-screen text that isn't a player name or a word. */
export const LABELS = Object.freeze({
  title: "Folded",
  tagline: "Draw it. They fold it. Your team guesses it.",
  start: "Start game",
  addPlayer: "Add player",
  artistHandoff: (artist) => `Pass to ${artist}`,
  artistHandoffNote: (team) => `${team}’s artist. Everyone else, look away!`,
  showWord: (artist) => `I’m ${artist}, show my word`,
  startDrawing: "Start drawing",
  yourWord: "Draw this",
  drawHint: "Draw with your finger or mouse. No letters!",
  undo: "Undo",
  clear: "Clear",
  submitDrawing: "Done",
  saboteurHandoff: (saboteur) => `Pass to ${saboteur}`,
  saboteurHandoffNote: (artistTeam) => `Time to sabotage. ${artistTeam}, no peeking!`,
  startSabotage: (saboteur) => `I’m ${saboteur}, let me fold it`,
  sabotageHint: "Drag across the drawing to place your fold",
  sabotageMoveHint: "Drag the strip to move it, or drag elsewhere to redraw it",
  sabotageShortHint: "Drag a little farther to set the angle",
  confirmFold: "Fold it!",
  revealHandoff: "Everyone, gather round!",
  revealHandoffNote: (saboteur) => `${saboteur} has picked a fold.`,
  reveal: "Fold the paper",
  guessHint: (artist) => `${artist} drew it: no guessing, no hints!`,
  guessPlaceholder: "Type a guess",
  guessButton: "Guess",
  giveUp: "Give up",
  guessedBy: (name) => `Guessed by ${name}`,
  foldedBy: (name) => `Folded by ${name}`,
  whatIsIt: (team) => `${team}, what is it?`,
  nextDraws: (team) => `Next round: ${team} draws`,
  wrongGuess: "Nope",
  outcome: {
    guessed: (team) => `${team} got it!`,
    stumped: (team) => `${team} folded them up!`,
  },
  answerWas: "The word was",
  original: "Before",
  folded: "After",
  finalScores: "Final scores",
  winner: (team) => `${team} wins!`,
  tie: "It’s a tie!",
  playAgain: "Play again",
  newTeams: "Change teams",
  timeUp: "Time’s up!",
  blankDrawing: "Blank page!",
  errors: {
    "wrong-phase": "Not right now.",
    "not-your-role": "That’s not your job this round.",
    "unknown-player": "Who’s that?",
    "bad-teams": "Each team needs at least two players.",
    "fold-too-short": "Drag a little farther to set the angle.",
    "fold-misses-paper": "The fold has to cross the paper.",
    "no-fold": "Place a fold first.",
    "empty-guess": "Type a guess first.",
    "unknown-event": "Something went wrong.",
  },
});

export const DEFAULT_TEAMS = Object.freeze([
  { name: "Team Sun", color: "#e3742f", players: ["Player 1", "Player 2"] },
  { name: "Team Sky", color: "#2f7fc1", players: ["Player 3", "Player 4"] },
]);
