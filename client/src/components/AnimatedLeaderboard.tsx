import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeaderboardEntry } from '@cadoot/shared';
import AvatarBadge from './AvatarBadge';
import { RankDelta } from './Leaderboard';

/** Beat where the pre-question standings sit still, so the room can read them. */
const HOLD_MS = 900;
/** How long the score count-up — and the reordering it drives — takes. */
const COUNT_MS = 1800;
/** Vertical gap between rows. Row height itself is measured from the DOM. */
const GAP_PX = 6;

interface Row {
  nickname: string;
  avatar?: string;
  /** Score going into the question just revealed. */
  prevScore: number;
  /** Score after it. */
  score: number;
  /** Server-assigned final rank; also the tie-break so we land where it says. */
  rank: number;
  delta?: number | null;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The between-question standings on the host screen.
 *
 * Rows start at the scores players held *going into* the question, then every
 * score counts up at once. Position is recomputed from the interpolated scores
 * on each frame, so a player physically climbs past the people they overtook,
 * at the moment they overtake them.
 *
 * Positions are written straight to the DOM rather than through React state —
 * at 60fps a re-render per frame would cost far more than it buys.
 */
export default function AnimatedLeaderboard({
  entries,
  maxPossible,
  limit = 10,
  highlight = null,
}: {
  entries: LeaderboardEntry[];
  /** Score a flawless player would hold by now; each bar is drawn against it. */
  maxPossible: number;
  limit?: number;
  highlight?: string | null;
}) {
  const [settled, setSettled] = useState(false);

  // Everyone stays in the animation, even well outside the top `limit`, so
  // mid-flight ranks are honest; rows below the cut are parked out of view.
  const rows = useMemo<Row[]>(
    () =>
      entries.map((e) => ({
        nickname: e.nickname,
        avatar: e.avatar,
        score: e.score,
        prevScore: e.score - (e.gained ?? 0),
        rank: e.rank,
        delta: e.delta,
      })),
    [entries],
  );

  const listRef = useRef<HTMLOListElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const scoreRefs = useRef(new Map<string, HTMLSpanElement>());
  const rankRefs = useRef(new Map<string, HTMLSpanElement>());
  const fillRefs = useRef(new Map<string, HTMLSpanElement>());

  useEffect(() => {
    setSettled(false);
    const list = listRef.current;
    if (!list || rows.length === 0) return;

    const firstRow: HTMLLIElement | undefined = rowRefs.current
      .values()
      .next().value;
    const slot = (firstRow?.getBoundingClientRect().height || 40) + GAP_PX;
    const visible = Math.min(limit, rows.length);
    list.style.height = `${visible * slot - GAP_PX}px`;

    /** Lays out every row for progress `t` (0 = pre-question, 1 = final). */
    const place = (t: number, instant: boolean) => {
      if (instant) {
        rowRefs.current.forEach((el) => {
          el.style.transition = 'none';
        });
      }

      const vals = rows.map((r) => ({
        r,
        v: r.prevScore + (r.score - r.prevScore) * t,
      }));
      // Ties break on the server's rank, so the final frame agrees with it.
      vals.sort((a, b) => b.v - a.v || a.r.rank - b.r.rank);

      vals.forEach(({ r, v }, i) => {
        const el = rowRefs.current.get(r.nickname);
        if (!el) return;
        const offscreen = i >= limit;
        // Below the cut, rows stack on the first hidden slot and fade, so
        // climbing into the top 10 reads as sliding in from underneath.
        el.style.transform = `translateY(${Math.min(i, limit) * slot}px)`;
        el.style.opacity = offscreen ? '0' : '1';
        el.setAttribute('aria-hidden', offscreen ? 'true' : 'false');

        const score = scoreRefs.current.get(r.nickname);
        if (score) score.textContent = String(Math.round(v));
        const rank = rankRefs.current.get(r.nickname);
        if (rank) rank.textContent = String(i + 1);
        // Width is set per frame rather than via a CSS transition, so the bar
        // grows in lockstep with the number it represents.
        const fill = fillRefs.current.get(r.nickname);
        if (fill) {
          const pct = maxPossible > 0 ? (v / maxPossible) * 100 : 0;
          fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }
      });

      if (instant) {
        void list.offsetHeight; // flush, so the next change animates
        rowRefs.current.forEach((el) => {
          el.style.transition = '';
        });
      }
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      place(1, true);
      setSettled(true);
      return;
    }

    place(0, true);

    let raf = 0;
    let startTs = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / COUNT_MS);
      place(easeOutCubic(t), false);
      if (t < 1) raf = requestAnimationFrame(step);
      else setSettled(true);
    };
    const hold = setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, HOLD_MS);

    return () => {
      clearTimeout(hold);
      cancelAnimationFrame(raf);
    };
  }, [rows, limit, maxPossible]);

  if (rows.length === 0) return <p className="muted">No players yet.</p>;

  return (
    <ol
      ref={listRef}
      className={`leaderboard lb-animated${settled ? ' settled' : ''}`}
    >
      {rows.map((r) => (
        <li
          key={r.nickname}
          ref={(el) => {
            if (el) rowRefs.current.set(r.nickname, el);
            else rowRefs.current.delete(r.nickname);
          }}
          className={highlight && r.nickname === highlight ? 'me' : ''}
        >
          <span
            className="lb-rank"
            ref={(el) => {
              if (el) rankRefs.current.set(r.nickname, el);
              else rankRefs.current.delete(r.nickname);
            }}
          >
            {r.rank}
          </span>
          <AvatarBadge id={r.avatar} className="lb-avatar" />
          <span className="lb-name">{r.nickname}</span>
          <span className="lb-track">
            <span
              className="lb-fill"
              ref={(el) => {
                if (el) fillRefs.current.set(r.nickname, el);
                else fillRefs.current.delete(r.nickname);
              }}
            />
          </span>
          <RankDelta delta={r.delta} />
          <span
            className="lb-score"
            ref={(el) => {
              if (el) scoreRefs.current.set(r.nickname, el);
              else scoreRefs.current.delete(r.nickname);
            }}
          >
            {r.prevScore}
          </span>
        </li>
      ))}
    </ol>
  );
}
