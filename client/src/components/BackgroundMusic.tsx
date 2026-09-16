import { useEffect } from 'react';
import { useStore } from '../store';
import { ensureCtx } from '../sound';
import { setMusicDucked, startMusic, stopMusic } from '../music';

/**
 * Loops the synthesized background music on the host screen while sound is on,
 * quieter while a question is up so it doesn't compete with reading.
 */
export default function BackgroundMusic() {
  const soundOn = useStore((s) => s.soundOn);
  const phase = useStore((s) => s.serverPhase);

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
    setMusicDucked(phase === 'question');
  }, [phase]);

  return null;
}
