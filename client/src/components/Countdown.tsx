/** Below this, the countdown turns urgent (and so does the music). */
export const LOW_TIME_MS = 5000;

export default function Countdown({
  remainingMs,
  totalMs,
}: {
  remainingMs: number;
  totalMs: number;
}) {
  const pct =
    totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const secs = Math.ceil(remainingMs / 1000);
  const low = remainingMs <= LOW_TIME_MS;
  return (
    <div className="countdown">
      {/* Keyed on the second so the "low" pulse replays on every tick. */}
      <div key={secs} className={`countdown-num${low ? ' low' : ''}`}>
        {secs}
      </div>
      <div className="countdown-bar">
        <div
          className={`countdown-fill${low ? ' low' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
