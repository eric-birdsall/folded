/* The word library. Categories split by difficulty, like Drunk Drawing's
 * list. Pick shapes that are easy to recognize and funny with a piece
 * missing: long necks, tall stacks, many legs.
 *
 * An entry is a word, or `[word, ...aliases]` when other answers should
 * count too. */
export const WORDS = Object.freeze({
  animals: {
    easy: [
      "elephant",
      "giraffe",
      ["dinosaur", "dino"],
      "spider",
      "octopus",
      "snake",
      "snail",
      "turtle",
      "penguin",
      "fish",
      "rabbit",
      "duck",
      "whale",
      "cat",
      "dog",
    ],
    medium: ["flamingo", "kangaroo", "peacock", "crocodile", "camel", "seahorse", "owl", "butterfly", "lobster"],
  },
  vehicles: {
    easy: [["airplane", "plane", "aeroplane"], ["bicycle", "bike"], "rocket", "train", "car", "boat", "bus"],
    medium: ["helicopter", "tractor", ["hot air balloon", "balloon"], "sailboat", "submarine", "skateboard"],
  },
  food: {
    easy: ["pizza", "banana", ["ice cream", "ice cream cone"], "apple", "carrot", "cake", "hot dog"],
    medium: ["pineapple", "cupcake", "hamburger", "popsicle", "pretzel", "taco", "sandwich"],
  },
  things: {
    easy: [
      "snowman",
      "umbrella",
      "robot",
      "house",
      "tree",
      "ladder",
      "flower",
      "sun",
      "key",
      "guitar",
      ["glasses", "eyeglasses"],
      "castle",
    ],
    medium: [
      "lighthouse",
      ["traffic light", "stoplight"],
      "windmill",
      "scissors",
      "toothbrush",
      "candle",
      "lamp",
      "mailbox",
      "swing set",
      "trampoline",
      "birdhouse",
    ],
  },
});

export const DIFFICULTY = Object.freeze({ EASY: "easy", MEDIUM: "medium" });

/** Turn a library entry into `{ word, answers }`. */
function toPrompt(entry, category, difficulty) {
  const [word, ...aliases] = Array.isArray(entry) ? entry : [entry];
  return Object.freeze({ word, answers: Object.freeze([word, ...aliases]), category, difficulty });
}

/** Every prompt in the given categories and difficulties. */
export function promptsFor(categories = Object.keys(WORDS), difficulties = Object.values(DIFFICULTY)) {
  return categories.flatMap((category) =>
    difficulties.flatMap((difficulty) =>
      (WORDS[category]?.[difficulty] || []).map((entry) => toPrompt(entry, category, difficulty)),
    ),
  );
}

/** Draw prompts without repeats until the pool runs out, then start over. */
export function createWordPicker({ categories, difficulties, random = Math.random } = {}) {
  let pool = promptsFor(categories, difficulties);
  if (!pool.length) pool = promptsFor();
  const used = new Set();
  return () => {
    if (used.size >= pool.length) used.clear();
    const available = pool.filter((prompt) => !used.has(prompt.word));
    const prompt = available[Math.floor(random() * available.length)];
    used.add(prompt.word);
    return prompt;
  };
}
