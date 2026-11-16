/* Little synthesized sounds, no audio files. Muting is remembered on the
 * device. */

const KEY = "folded-muted";
let ctx;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === "1";
} catch {}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {}
}

/** Browsers only allow audio after a tap; call this from one. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {}
}

function tone(freq, { at = 0, dur = 0.14, type = "sine", gain = 0.12, to } = {}) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Paper noise: filtered white noise swept from `from` to `to` Hz. */
function rustle({ at = 0, dur = 0.35, from = 900, to = 3200, gain = 0.2 } = {}) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(t);
}

export const sfx = {
  tap: () => tone(660, { dur: 0.06, gain: 0.05 }),
  crease: () => rustle({ dur: 0.18, from: 2400, to: 4200, gain: 0.08 }),
  fold: () => rustle({ dur: 0.5, from: 700, to: 2600, gain: 0.22 }),
  snap: () => {
    rustle({ dur: 0.09, from: 3000, to: 1200, gain: 0.25 });
    tone(140, { dur: 0.12, type: "triangle", gain: 0.12, to: 90 });
  },
  wrong: () => tone(330, { dur: 0.16, type: "triangle", gain: 0.07, to: 280 }),
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.22, gain: 0.1 })),
  stumped: () => [392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.24, type: "triangle", gain: 0.08 })),
  tick: () => tone(1200, { dur: 0.04, gain: 0.04 }),
};
