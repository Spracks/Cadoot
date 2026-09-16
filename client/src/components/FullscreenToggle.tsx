import { useEffect, useState } from 'react';

/**
 * Host-screen full-screen switch: a corner button beside the sound toggle,
 * plus the F key. Esc leaves full screen as usual (the browser handles that).
 * Hidden where the browser doesn't support the Fullscreen API (e.g. iPhone).
 */
export default function FullscreenToggle() {
  const supported =
    typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const [isFull, setIsFull] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  useEffect(() => {
    if (!supported) return;
    const onChange = () => setIsFull(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      ) {
        return;
      }
      e.preventDefault();
      toggleFullscreen();
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [supported]);

  if (!supported) return null;

  const label = isFull ? 'Exit full screen (F)' : 'Full screen (F)';
  return (
    <button
      type="button"
      className="sound-toggle fullscreen-toggle"
      onClick={toggleFullscreen}
      aria-pressed={isFull}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d={
            isFull
              ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6'
              : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6'
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  } else {
    void document.documentElement.requestFullscreen().catch(() => {});
  }
}
