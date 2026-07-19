import type { LeaderboardEntry } from '@cadoot/shared';
import { avatarGlyph } from '../avatars';

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
          <span className="lb-avatar" aria-hidden="true">
            {avatarGlyph(e.avatar)}
          </span>
          <span className="lb-name">{e.nickname}</span>
          <RankDelta delta={e.delta} />
          <span className="lb-score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}

/** ▲/▼ rank-change badge vs the previous question (nothing on first reveal). */
export function RankDelta({ delta }: { delta?: number | null }) {
  if (delta == null) return <span className="lb-delta" />;
  if (delta === 0)
    return (
      <span className="lb-delta same" title="No change">
        –
      </span>
    );
  const up = delta > 0;
  return (
    <span
      className={`lb-delta ${up ? 'up' : 'down'}`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)}`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(delta)}
    </span>
  );
}
