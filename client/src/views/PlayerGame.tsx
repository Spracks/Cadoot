import { useState, type FormEvent } from 'react';
import { useStore, getInitialPin } from '../store';
import AnswerTiles from '../components/AnswerTiles';
import Leaderboard from '../components/Leaderboard';

export default function PlayerGame() {
  const pin = useStore((s) => s.pin);
  const phase = useStore((s) => s.serverPhase);
  if (!pin) return <Join />;
  if (phase === 'question') return <PlayerQuestion />;
  if (phase === 'reveal') return <PlayerReveal />;
  if (phase === 'over') return <PlayerOver />;
  return <PlayerLobby />;
}

function Join() {
  const join = useStore((s) => s.join);
  const setRole = useStore((s) => s.setRole);
  const initialPin = getInitialPin();
  const [pin, setPin] = useState(initialPin ?? '');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await join(pin.trim(), nickname.trim());
    } catch {
      /* surfaced via the error banner */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen center">
      <button className="link-btn back" onClick={() => setRole('none')}>
        ← Back
      </button>
      <h1 className="logo small">Join a game</h1>
      <form className="card join-card" onSubmit={submit}>
        <label>
          Game PIN
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="123456"
            autoFocus={!initialPin}
            required
          />
        </label>
        <label>
          Nickname
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            autoFocus={!!initialPin}
            required
          />
        </label>
        <button
          className="btn primary"
          type="submit"
          disabled={busy || !pin.trim() || !nickname.trim()}
        >
          Join
        </button>
      </form>
    </div>
  );
}

function PlayerLobby() {
  const nickname = useStore((s) => s.myNickname);
  return (
    <div className="screen center">
      <h1 className="logo small">You’re in!</h1>
      <p className="big-name">{nickname}</p>
      <p className="muted">Look at the shared screen. The game starts soon…</p>
    </div>
  );
}

function PlayerQuestion() {
  const q = useStore((s) => s.question);
  const hasAnswered = useStore((s) => s.hasAnswered);
  const answer = useStore((s) => s.answer);
  const remainingMs = useStore((s) => s.remainingMs);
  if (!q) return null;
  if (hasAnswered) {
    return (
      <div className="screen center">
        <h2 className="q-text small">Answer locked in ✓</h2>
        <p className="muted">Waiting for other players…</p>
      </div>
    );
  }
  return (
    <div className="screen player-question" key={q.index}>
      <div className="pq-head">
        <span className="q-count">
          Q{q.index + 1}/{q.total}
        </span>
        <span className="pq-time">{Math.ceil(remainingMs / 1000)}s</span>
      </div>
      <h2 className="q-text small q-enter">{q.text}</h2>
      <AnswerTiles
        options={q.options}
        onPick={answer}
        variant={q.type === 'boolean' ? 'boolean' : 'multiple'}
      />
    </div>
  );
}

function PlayerReveal() {
  const result = useStore((s) => s.myResult);
  const hasAnswered = useStore((s) => s.hasAnswered);
  if (!result) {
    return (
      <div className="screen center">
        <h2>{hasAnswered ? 'Checking…' : "Time's up!"}</h2>
      </div>
    );
  }
  return (
    <div className={`screen center result ${result.correct ? 'good' : 'bad'}`}>
      <h1>
        {result.correct
          ? 'Correct! 🎉'
          : hasAnswered
            ? 'Not quite'
            : "Time's up"}
      </h1>
      <p className="points">+{result.pointsEarned}</p>
      <p className="muted">
        Score {result.totalScore} · Rank #{result.rank}
      </p>
    </div>
  );
}

function PlayerOver() {
  const lb = useStore((s) => s.finalLeaderboard) ?? [];
  const nickname = useStore((s) => s.myNickname);
  const reset = useStore((s) => s.reset);
  const me = lb.find((e) => e.nickname === nickname);
  return (
    <div className="screen center">
      <h1 className="logo small">Game over</h1>
      {me && (
        <p className="big-name">
          #{me.rank} · {me.score} pts
        </p>
      )}
      <div className="card">
        <Leaderboard entries={lb} limit={5} highlight={nickname} />
      </div>
      <button className="btn ghost" onClick={reset}>
        Leave
      </button>
    </div>
  );
}
