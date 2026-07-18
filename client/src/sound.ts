/**
 * Tiny Web Audio sound effects — no audio files to bundle, just synthesized
 * tones. Off by default; the host can toggle it (sound plays on the host /
 * projector, not on student devices, so a room of phones stays quiet).
 */
const KEY = 'cadoot.sound';
let enabled = false;
let ctx: AudioContext | null = null;

export function initSoundFromStorage(): boolean {
  try {
    enabled = localStorage.getItem(KEY) === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (on) ensureCtx(); // resume within the click gesture that enabled it
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.07,
): void {
  const ac = ensureCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startOffset;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export type SoundName =
  | 'questionStart'
  | 'reveal'
  | 'gameOver'
  | 'join';

export function playSound(name: SoundName): void {
  if (!enabled) return;
  switch (name) {
    case 'questionStart':
      tone(523, 0, 0.15, 'triangle');
      tone(784, 0.12, 0.18, 'triangle');
      break;
    case 'reveal':
      tone(440, 0, 0.12, 'sine');
      tone(660, 0.1, 0.22, 'sine');
      break;
    case 'gameOver':
      tone(523, 0, 0.15, 'triangle');
      tone(659, 0.14, 0.15, 'triangle');
      tone(784, 0.28, 0.15, 'triangle');
      tone(1046, 0.42, 0.32, 'triangle');
      break;
    case 'join':
      tone(880, 0, 0.08, 'sine', 0.05);
      break;
  }
}
