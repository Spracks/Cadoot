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
  const low = secs <= 5;
  return (
    <div className="countdown">
      <div className={`countdown-num${low ? ' low' : ''}`}>{secs}</div>
      <div className="countdown-bar">
        <div
          className={`countdown-fill${low ? ' low' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
