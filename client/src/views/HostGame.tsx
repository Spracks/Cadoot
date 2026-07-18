import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import AnswerTiles from '../components/AnswerTiles';
import Countdown from '../components/Countdown';
import Leaderboard from '../components/Leaderboard';
import SoundToggle from '../components/SoundToggle';
import { playSound } from '../sound';

export default function HostGame() {
  const phase = useStore((s) => s.serverPhase);
  let view;
  if (phase === 'question') view = <HostQuestion />;
  else if (phase === 'reveal') view = <HostReveal />;
  else if (phase === 'over') view = <HostOver />;
  else view = <HostLobby />;
  return (
    <>
      <SoundToggle />
      {view}
    </>
  );
}

function HostLobby() {
  const pin = useStore((s) => s.pin)!;
  const players = useStore((s) => s.players);
  const startGame = useStore((s) => s.startGame);
  const [urls, setUrls] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((d: { urls?: string[]; pinned?: boolean }) => {
        const list = d.urls ?? [];
        setUrls(list);
        setPinned(!!d.pinned);
        setSelected(list[0] ?? null);
      })
      .catch(() => setSelected(null));
  }, []);

  const joinUrl = selected ? `${selected}/?pin=${pin}` : null;
  const showPicker = !pinned && urls.length > 1;

  return (
    <div className="screen host-lobby">
      <div className="lobby-head">
        <div className="pin-block">
          <span className="pin-label">Game PIN</span>
          <span className="pin">{pin}</span>
          <span className="join-url">
            {selected
              ? `Join at ${selected.replace(/^https?:\/\//, '')}`
              : 'Join from the address shown in the server terminal'}
          </span>
          {showPicker && (
            <label className="addr-picker">
              Students can’t connect? Try another address:
              <select
                value={selected ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {urls.map((u) => (
                  <option key={u} value={u}>
                    {u.replace(/^https?:\/\//, '')}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {joinUrl && (
          <div className="qr">
            <QRCodeSVG value={joinUrl} size={168} />
            <span className="qr-caption">Scan to join</span>
          </div>
        )}
      </div>

      <div className="lobby-body">
        <div className="lobby-players-head">
          <h2>
            {players.length} {players.length === 1 ? 'player' : 'players'} joined
          </h2>
          <button
            className="btn primary"
            onClick={startGame}
            disabled={players.length === 0}
          >
            Start game
          </button>
        </div>
        <ul className="player-chips">
          {players.map((p) => (
            <li
              key={p.id}
              className={`chip${p.connected ? '' : ' offline'}`}
              title={p.connected ? undefined : 'Disconnected — can rejoin'}
            >
              {p.nickname}
            </li>
          ))}
          {players.length === 0 && (
            <li className="muted">Waiting for players to join…</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function HostQuestion() {
  const q = useStore((s) => s.question);
  const remainingMs = useStore((s) => s.remainingMs);
  const skip = useStore((s) => s.skipQuestion);
  useEffect(() => {
    playSound('questionStart');
  }, [q?.index]);
  if (!q) return null;
  return (
    <div className="screen host-question">
      <div className="q-head">
        <span className="q-count">
          Question {q.index + 1} of {q.total}
        </span>
        <Countdown remainingMs={remainingMs} totalMs={q.timeLimitSec * 1000} />
      </div>
      <div className="q-stage" key={q.index}>
        <h1 className="q-text q-enter">{q.text}</h1>
        <AnswerTiles
          options={q.options}
          big
          variant={q.type === 'boolean' ? 'boolean' : 'multiple'}
        />
      </div>
      <div className="host-controls">
        <button className="btn ghost" onClick={skip}>
          Skip / reveal now
        </button>
      </div>
    </div>
  );
}

function HostReveal() {
  const q = useStore((s) => s.question);
  const reveal = useStore((s) => s.reveal);
  const next = useStore((s) => s.nextQuestion);
  const end = useStore((s) => s.endGame);
  useEffect(() => {
    playSound('reveal');
  }, []);
  if (!q || !reveal) return null;
  const isLast = q.index + 1 >= q.total;
  return (
    <div className="screen host-reveal">
      <h1 className="q-text">{q.text}</h1>
      <AnswerTiles
        options={q.options}
        correctIndex={reveal.correctIndex}
        distribution={reveal.distribution}
        big
        variant={q.type === 'boolean' ? 'boolean' : 'multiple'}
      />
      <div className="reveal-lb">
        <h2>Leaderboard</h2>
        <Leaderboard entries={reveal.leaderboard} limit={5} />
      </div>
      <div className="host-controls">
        {isLast ? (
          <button className="btn primary" onClick={end}>
            Show final results
          </button>
        ) : (
          <button className="btn primary" onClick={next}>
            Next question →
          </button>
        )}
      </div>
    </div>
  );
}

function HostOver() {
  const lb = useStore((s) => s.finalLeaderboard) ?? [];
  const reset = useStore((s) => s.reset);
  const top = lb.slice(0, 3);
  useEffect(() => {
    playSound('gameOver');
  }, []);
  return (
    <div className="screen host-over">
      <h1 className="logo">Final results</h1>
      <div className="podium">
        {top.map((e, i) => (
          <div
            key={e.nickname}
            className={`podium-spot rank-${e.rank}`}
            style={{ animationDelay: `${i * 0.25}s` }}
          >
            <div className="podium-name">{e.nickname}</div>
            <div className="podium-bar">
              <span>{e.rank}</span>
            </div>
            <div className="podium-score">{e.score} pts</div>
          </div>
        ))}
      </div>
      {lb.length > 3 && (
        <div className="card rest-lb">
          <Leaderboard entries={lb.slice(3)} />
        </div>
      )}
      <button className="btn ghost" onClick={reset}>
        New game
      </button>
    </div>
  );
}
