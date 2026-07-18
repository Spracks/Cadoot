import type { LeaderboardEntry } from '@cadoot/shared';

export default function Leaderboard({
  entries,
  limit,
  highlight = null,
}: {
  entries: LeaderboardEntry[];
  limit?: number;
  highlight?: string | null;
}) {
  const rows = limit ? entries.slice(0, limit) : entries;
  if (rows.length === 0) return <p className="muted">No players yet.</p>;
  return (
    <ol className="leaderboard">
      {rows.map((e) => (
        <li
          key={e.nickname}
          className={highlight && e.nickname === highlight ? 'me' : ''}
        >
          <span className="lb-rank">{e.rank}</span>
          <span className="lb-name">{e.nickname}</span>
          <span className="lb-score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}
