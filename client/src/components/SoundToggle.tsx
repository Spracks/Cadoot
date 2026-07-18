import { useStore } from '../store';

export default function SoundToggle() {
  const soundOn = useStore((s) => s.soundOn);
  const toggleSound = useStore((s) => s.toggleSound);
  return (
    <button
      type="button"
      className="sound-toggle"
      onClick={toggleSound}
      aria-pressed={soundOn}
      title={soundOn ? 'Sound on — click to mute' : 'Sound off — click to enable'}
    >
      {soundOn ? '🔊' : '🔇'}
    </button>
  );
}
