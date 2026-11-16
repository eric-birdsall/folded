/* Guess checking. Forgiving about everything but the word itself: case,
 * accents, punctuation, spacing, a leading "a"/"the", and a plural. */

const ARTICLES = new Set(["a", "an", "the", "some"]);

/** Lowercase words with accents, punctuation and extra spaces removed. */
export function normalizeGuess(text) {
  const words = String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

/** Spacing doesn't count either: "hotdog" is "hot dog". */
const squash = (text) => normalizeGuess(text).replace(/ /g, "");

const plurals = (word) => [word, `${word}s`, `${word}es`, word.endsWith("y") ? `${word.slice(0, -1)}ies` : word];

/** Does `guess` match any of the accepted `answers`? */
export function isCorrectGuess(guess, answers) {
  const said = squash(guess);
  if (!said) return false;
  return answers.some((answer) => plurals(squash(answer)).includes(said));
}
