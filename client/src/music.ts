/**
 * Synthesized background music for the host screen: an original, upbeat
 * game-show loop built from Web Audio oscillators, in the same spirit as the
 * sound effects in sound.ts — no audio files to bundle or license, and it works
 * offline. Notes are scheduled slightly ahead of time on the audio clock (the
 * usual "lookahead scheduler") so timers jittering never makes the beat wobble.
 */
import { ensureCtx } from './sound';

const BPM = 124;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.15;
const TICK_MS = 25;

const LEVEL = 0.5; // overall music volume, under the sound effects
const DUCK = 0.45; // fraction of LEVEL while a question is on screen
const HURRY = 0.85; // fraction of LEVEL in the last seconds of a question
const HURRY_SECS = 5; // how long the hurry build lasts; matches LOW_TIME_MS
const LEAD_LEVEL = 0.04; // melody volume; raise it to bring the tune forward

// Chords as MIDI notes (root, third, fifth).
type Chord = readonly [root: number, third: number, fifth: number];
const C: Chord = [48, 52, 55];
const Am: Chord = [45, 48, 52];
const F: Chord = [41, 45, 48];
const G: Chord = [43, 47, 50];
const Em: Chord = [40, 43, 47];

// Bass: [step, chord tone offset in semitones from the root]. Bouncy, not busy.
const BASS: [number, number][] = [
  [0, 0],
  [3, 0],
  [6, 12],
  [8, 0],
  [11, 7],
  [14, 12],
];

// Chord-tone order for the marimba arpeggio on 8th notes (3 = root an octave up).
type Arp = readonly [number, number, number, number, number, number, number, number];
const ARP_A: Arp = [0, 1, 2, 3, 2, 1, 2, 3];
const ARP_B: Arp = [3, 2, 1, 2, 3, 2, 1, 0];

/** A lead note: [step, midi, length in steps]. */
type Note = readonly [step: number, midi: number, len: number];
interface Bar {
  chord: Chord;
  section: 'A' | 'B';
  melody?: readonly Note[];
}

/**
 * The full loop (~31s): section A is four bars of groove, then a bouncy melody;
 * section B moves to new chords with a longer, more sung melody, and ends in a
 * drum fill that leads back to the top.
 */
const SONG: readonly Bar[] = [
  // ----- A -----
  { section: 'A', chord: C },
  { section: 'A', chord: Am },
  { section: 'A', chord: F },
  { section: 'A', chord: G },
  { section: 'A', chord: C, melody: [[0, 76, 2], [3, 79, 2], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 74, 3]] },
  { section: 'A', chord: Am, melody: [[0, 72, 2], [3, 76, 2], [6, 72, 2], [8, 69, 2], [10, 71, 2], [12, 72, 3]] },
  { section: 'A', chord: F, melody: [[0, 69, 2], [3, 72, 2], [6, 77, 2], [8, 76, 2], [10, 74, 2], [12, 72, 3]] },
  { section: 'A', chord: G, melody: [[0, 71, 2], [3, 74, 2], [6, 79, 4], [10, 77, 2], [12, 74, 2], [14, 71, 2]] },
  // ----- B -----
  { section: 'B', chord: F, melody: [[0, 72, 3], [3, 77, 3], [6, 76, 2], [10, 72, 4]] },
  { section: 'B', chord: G, melody: [[0, 74, 3], [3, 79, 3], [6, 77, 2], [10, 74, 4]] },
  { section: 'B', chord: Em, melody: [[0, 71, 3], [3, 76, 3], [6, 79, 2], [8, 76, 2], [10, 71, 4]] },
  { section: 'B', chord: Am, melody: [[0, 72, 6], [8, 76, 2], [10, 72, 2], [12, 69, 4]] },
  { section: 'B', chord: F, melody: [[0, 69, 2], [2, 72, 2], [4, 77, 2], [6, 81, 4], [12, 77, 2], [14, 76, 2]] },
  { section: 'B', chord: G, melody: [[0, 74, 4], [6, 79, 2], [8, 77, 2], [10, 74, 2], [12, 71, 2], [14, 74, 2]] },
  { section: 'B', chord: C, melody: [[0, 76, 6], [8, 72, 2], [10, 76, 2], [12, 79, 4]] },
  { section: 'B', chord: G, melody: [[0, 74, 2], [2, 71, 2], [4, 74, 2], [6, 77, 2], [8, 79, 8]] },
];

let bus: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let mood: MusicMood = 'normal';
let restartPending = false;
let hurryStart = 0; // audio time the hurry build began
let riser: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let noise: AudioBuffer | null = null;

/**
 * normal: the full loop. question: the same, quieter, while students read.
 * hurry: time is nearly up — a stripped-down, driving variation.
 */
export type MusicMood = 'normal' | 'question' | 'hurry';

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const target = () =>
  LEVEL * (mood === 'hurry' ? HURRY : mood === 'question' ? DUCK : 1);

export function startMusic(): void {
  if (timer) return;
  const ac = ensureCtx();
  if (!ac) return;
  bus = ac.createGain();
  bus.gain.value = 0;
  bus.connect(ac.destination);
  bus.gain.setTargetAtTime(target(), ac.currentTime, 0.4);
  nextTime = ac.currentTime + 0.1;
  step = 0;
  restartPending = false;
  if (mood === 'hurry') beginHurry(ac, bus, nextTime);
  timer = setInterval(() => {
    if (!bus) return;
    // After the tab was throttled or the context suspended, don't try to
    // "catch up" by blasting every missed note at once.
    if (nextTime < ac.currentTime - 0.1) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      if (restartPending) {
        // Coming out of the hurry variation: land on the top of the song
        // with a cymbal, so the change reads as a deliberate ending.
        restartPending = false;
        step = 0;
        crash(ac, bus, nextTime);
      }
      scheduleStep(ac, bus, step, nextTime);
      nextTime += STEP;
      step++;
    }
  }, TICK_MS);
}

export function stopMusic(): void {
  if (timer) clearInterval(timer);
  timer = null;
  const old = bus;
  bus = null;
  if (!old) return;
  endRiser(old.context.currentTime);
  const ac = old.context;
  old.gain.cancelScheduledValues(ac.currentTime);
  old.gain.setTargetAtTime(0, ac.currentTime, 0.15);
  setTimeout(() => old.disconnect(), 800);
}

/** Follow the game: quieter during questions, urgent as time runs out. */
export function setMusicMood(next: MusicMood): void {
  if (next === mood) return;
  if (mood === 'hurry') {
    restartPending = true;
    endRiser(nextTime);
  }
  mood = next;
  if (!bus) return;
  if (mood === 'hurry') beginHurry(bus.context as AudioContext, bus, nextTime);
  bus.gain.setTargetAtTime(target(), bus.context.currentTime, 0.3);
}

/**
 * Start the hurry build: everything in the hurry variation scales with how far
 * into it we are, and a filtered-noise "whoosh" rises underneath until the end.
 */
function beginHurry(ac: AudioContext, out: AudioNode, t: number): void {
  hurryStart = t;
  endRiser(t);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(6000, t + HURRY_SECS);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + HURRY_SECS);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
  riser = { src, gain: g };
}

function endRiser(t: number): void {
  if (!riser) return;
  const { src, gain } = riser;
  riser = null;
  const at = Math.max(t, gain.context.currentTime);
  if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(at);
  else gain.gain.cancelScheduledValues(at);
  gain.gain.setTargetAtTime(0, at, 0.03);
  src.stop(at + 0.3);
}

function scheduleStep(
  ac: AudioContext,
  out: GainNode,
  n: number,
  t: number,
): void {
  const barIndex = Math.floor(n / STEPS_PER_BAR) % SONG.length;
  const bar = SONG[barIndex];
  if (!bar) return;
  const s = n % STEPS_PER_BAR;
  const { chord } = bar;
  const inB = bar.section === 'B';
  const lastBar = barIndex === SONG.length - 1;
  // Bass, kept in one comfortable octave (A1–G#2) whatever the chord.
  const bassRoot = ((chord[0] - 33) % 12) + 33;

  if (mood === 'hurry') {
    // Melody and marimba drop out and the groove tightens, building as the
    // clock runs down (p goes 0 → 1 over the final seconds).
    const p = Math.min(1, Math.max(0, (t - hurryStart) / HURRY_SECS));

    // Kick on every beat; the snare builds from backbeat to 8ths to a 16th roll.
    if (s % 4 === 0) kick(ac, out, t);
    const snareEvery = p < 0.4 ? 8 : p < 0.75 ? 2 : 1;
    if (s % snareEvery === (snareEvery === 8 ? 4 : 0)) {
      clap(ac, out, t, 0.05 + p * 0.09);
    }
    hat(ac, out, t, s % 2 === 0 ? 0.06 : 0.03);

    // Driving staccato bass on every 16th, jumping an octave on the offbeats.
    bass(ac, out, t, hz(bassRoot + (s % 4 === 2 ? 12 : 0)), STEP * 0.8);

    // Alarm: a clashing half-step pair on 8ths that creeps upward.
    if (s % 2 === 0) {
      const top = chord[0] + 24 + Math.round(p * 6);
      alarm(ac, out, t, hz(s % 4 === 0 ? top : top + 1));
    }
    return;
  }

  // Drums — B gets busier hats, and the last bar a clap fill back to the top.
  if (s === 0 || s === 8) kick(ac, out, t);
  if (s === 4 || s === 12) clap(ac, out, t, 0.12);
  if (lastBar && (s === 13 || s === 14 || s === 15)) clap(ac, out, t, 0.05 + (s - 13) * 0.03);
  if (s % 4 === 2) hat(ac, out, t, 0.09);
  else if (s % 2 === 1) hat(ac, out, t, 0.03);
  else if (inB && s % 4 === 0) hat(ac, out, t, 0.05);

  // Bass
  for (const [bs, offset] of BASS) {
    if (bs === s) bass(ac, out, t, hz(bassRoot + offset), STEP * 1.6);
  }

  // Marimba arpeggio on 8ths
  if (s % 2 === 0) {
    const tones = [chord[0], chord[1], chord[2], chord[0] + 12] as const;
    const arp = inB ? ARP_B : ARP_A;
    const tone = tones[arp[s / 2] as 0 | 1 | 2 | 3];
    marimba(ac, out, t, hz(tone + 12), 0.05);
  }

  // Melody
  for (const [ms, midi, len] of bar.melody ?? []) {
    if (ms === s) lead(ac, out, t, hz(midi), STEP * len);
  }
}

// ---------- Instruments ----------

function envGain(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  peak: number,
  decay: number,
): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(out);
  return g;
}

function marimba(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  peak: number,
): void {
  const g = envGain(ac, out, t, peak, 0.35);
  for (const [mult, level] of [
    [1, 1],
    [4, 0.25],
  ] as const) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 0.4);
  }
}

function lead(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  dur: number,
): void {
  // Kept soft on purpose: a mellow triangle tone, filtered and eased in, so
  // the melody sits behind the groove rather than on top of it.
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(LEAD_LEVEL, t + 0.03);
  g.gain.setValueAtTime(LEAD_LEVEL, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g).connect(out);
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  o.connect(filter);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function bass(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  dur: number,
): void {
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(250, t + dur);
  filter.connect(envGain(ac, out, t, 0.09, dur));
  const o = ac.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  o.connect(filter);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function kick(ac: AudioContext, out: AudioNode, t: number): void {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  o.connect(envGain(ac, out, t, 0.28, 0.18));
  o.start(t);
  o.stop(t + 0.2);
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const len = Math.floor(ac.sampleRate * 1);
  noise = ac.createBuffer(1, len, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function noiseHit(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  type: BiquadFilterType,
  freq: number,
  peak: number,
  decay: number,
): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  src.connect(filter).connect(envGain(ac, out, t, peak, decay));
  src.start(t);
  src.stop(t + decay + 0.02);
}

function hat(ac: AudioContext, out: AudioNode, t: number, peak: number): void {
  noiseHit(ac, out, t, 'highpass', 7000, peak, 0.04);
}

function clap(ac: AudioContext, out: AudioNode, t: number, peak: number): void {
  noiseHit(ac, out, t, 'bandpass', 1500, peak, 0.12);
}

/** A short, buzzy stab for the hurry alarm. */
function alarm(ac: AudioContext, out: AudioNode, t: number, freq: number): void {
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  filter.connect(envGain(ac, out, t, 0.03, 0.09));
  const o = ac.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  o.connect(filter);
  o.start(t);
  o.stop(t + 0.11);
}

function crash(ac: AudioContext, out: AudioNode, t: number): void {
  noiseHit(ac, out, t, 'highpass', 5000, 0.08, 0.9);
}
