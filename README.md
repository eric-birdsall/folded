# Folded

Folded is a same-room drawing and guessing game for two teams sharing one device. An artist draws a secret word. A player on the other team folds a strip out of the drawing. Then the artist's team guesses what's left.

[Play Folded](https://eric-birdsall.github.io/folded/) in your browser. Every push to `main` is tested and deployed to GitHub Pages.

Run `npm ci` and `npm run dev`, then open the URL Vite prints. `npm test` runs the logic tests, and `npm run build` makes a static build. No backend is needed. Like Drunk Drawing, it works with touch or a mouse. There are no controller controls.

## A round

1. **Pass to the artist.** Everyone else looks away. The artist taps their name to see the word, then draws it in black pen (Undo, Clear, Done). When the clock runs out, the drawing is submitted as it is.
2. **Pass to the saboteur.** The artist's team looks away. The saboteur drags across the drawing to place a thick straight fold line at any angle. The shaded strip is what will vanish. Drag the strip to slide it, or drag somewhere else to redraw it; on a keyboard, the arrow keys nudge and turn it. **Fold it!** locks it in. If the clock runs out, the current preview is used. With no preview, the game picks a fold through the middle of the drawing.
3. **Gather round.** The paper folds: the strip is marked, its creases are drawn, it tucks underneath, and the two sides slide together.
4. **Guess.** The artist's teammates pick their name and type guesses. The artist can't guess or give hints. Guesses ignore case, punctuation, spacing, a leading "a" or "the", and plurals. Some words accept other answers too ("plane" for "airplane").
5. **Results** show the drawing before and after the fold. A correct guess scores 3 points, plus 1 if it comes in the first half of the guessing time. If the guessers miss, the folding team scores 2.

Teams swap roles every round, and artists and saboteurs take turns within each team. The game ends after each team has drawn the chosen number of times. Final scores come with a gallery of every round.

## How the fold works

The fold is plain geometry in paper units (`shared/foldGeometry.js`). The drag sets a point and an angle for an infinitely long axis; a fold that's too short is rejected. Everything within half the fold width of the axis is hidden. Everything else slides half the width toward the axis, so the sides meet at a seam. Nothing is scaled. `shared/foldPixels.js` applies that map to any RGBA image by mapping each output pixel back to its source. The finished picture players guess from comes from this function. The animation (`src/foldRender.js`, `src/foldAnimation.js`) draws the in-between frames with canvas clipping and ends on the same result.

## Layout

| File | What it does |
| --- | --- |
| `shared/config.js` | All tuning (times, fold width, scoring, rounds, words) plus the phase, role, event, outcome, error and label constants |
| `shared/game.js` | The authoritative controller: phases, timers, roles, word visibility, scoring, rotation |
| `shared/foldGeometry.js`, `shared/foldPixels.js` | The fold, with no DOM |
| `shared/words.js`, `shared/guess.js`, `shared/drawing.js` | Word library and picker, guess checking, stroke cleanup |
| `src/drawingPad.js`, `src/sabotageInput.js` | Pointer input for drawing and for placing the fold |
| `src/foldRender.js`, `src/foldAnimation.js`, `src/strokes.js` | Painting |
| `src/main.js` | Screens and wiring |

The controller only shows each player what they're allowed to see: `viewFor(playerId)` includes the word only for the artist, or for everyone once the round ends. The UI asks for the view of whoever is holding the device. A networked version would send each client its own view.
