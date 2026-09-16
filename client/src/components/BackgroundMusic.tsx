import { useEffect } from 'react';
import { useStore } from '../store';
import { ensureCtx } from '../sound';
import { setMusicMood, startMusic, stopMusic } from '../music';
import { LOW_TIME_MS } from './Countdown';

/**
 * Loops the synthesized background music on the host screen while sound is on:
 * quieter while a question is up so it doesn't compete with reading, then a
 * driving "hurry" variation over the countdown's final seconds.
 */
export default function BackgroundMusic() {
  const soundOn = useStore((s) => s.soundOn);
  const mood = useStore((s) =>
    s.serverPhase !== 'question'
      ? 'normal'
      : s.remainingMs <= LOW_TIME_MS
        ? 'hurry'
        : 'question',
  );

  useEffect(() => {
    if (!soundOn) return;
    startMusic();
    // If sound was remembered as on from last time, the browser keeps audio
    // suspended until the host interacts with the page; resume on first click.
    const resume = () => ensureCtx();
    window.addEventListener('pointerdown', resume, { once: true });
    return () => {
      window.removeEventListener('pointerdown', resume);
      stopMusic();
    };
  }, [soundOn]);

  useEffect(() => {
    setMusicMood(mood);
  }, [mood]);

  return null;
}
