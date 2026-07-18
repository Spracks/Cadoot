import { useStore } from '../store';

export default function ErrorBanner() {
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const reset = useStore((s) => s.reset);
  if (!error) return null;

  const fatal = /disconnect|ended/i.test(error);
  return (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      {fatal ? (
        <button className="link-btn" onClick={reset}>
          Back to start
        </button>
      ) : (
        <button className="link-btn" onClick={clearError} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
