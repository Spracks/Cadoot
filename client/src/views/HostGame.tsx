import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import type { RevealData } from '@cadoot/shared';
import AnswerTiles from '../components/AnswerTiles';
import PuzzleBoard from '../components/PuzzleBoard';
import {
  AcceptedAnswers,
  PuzzleKey,
  ResponseCloud,
} from '../components/RevealPanels';
import Countdown, { LOW_TIME_MS } from '../components/Countdown';
import Leaderboard from '../components/Leaderboard';
import AnimatedLeaderboard from '../components/AnimatedLeaderboard';
import SoundToggle from '../components/SoundToggle';
import FullscreenToggle from '../components/FullscreenToggle';
import BackgroundMusic from '../components/BackgroundMusic';
import RichText from '../components/RichText';
import Confetti from '../components/Confetti';
import AvatarBadge from '../components/AvatarBadge';
import { playSound } from '../sound';
import {
  classReportCsv,
  classReportHtml,
  classReportName,
  downloadFile,
} from '../results';

export default function HostGame() {
  const phase = useStore((s) => s.serverPhase);
  let view;
  if (phase === 'question') view = <HostQuestion />;
  else if (phase === 'reveal') view = <HostReveal />;
  else if (phase === 'over') view = <HostOver />;
  else view = <HostLobby />;
  return (
    <>
      <FullscreenToggle />
      <SoundToggle />
      <BackgroundMusic />
      {view}
    </>
  );
}

function HostLobby() {
  const pin = useStore((s) => s.pin)!;
  const quizTitle = useStore((s) => s.quizTitle);
  const players = useStore((s) => s.players);
  const startGame = useStore((s) => s.startGame);
  const cancelGame = useStore((s) => s.cancelGame);
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
      <div className="lobby-brand">
        <h1 className="logo small">Cadoot</h1>
        {quizTitle && <h2 className="lobby-title">{quizTitle}</h2>}
      </div>
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
            <QRCodeSVG value={joinUrl} size={320} />
            <span className="qr-caption">Scan to join</span>
          </div>
        )}
      </div>

      <div className="lobby-body">
        <div className="lobby-players-head">
          <h2>
            {players.length} {players.length === 1 ? 'player' : 'players'} joined
          </h2>
          <div className="lobby-actions">
            <button
              className="btn ghost"
              onClick={() => {
                const n = players.length;
                if (
                  n === 0 ||
                  window.confirm(
                    `${n} ${n === 1 ? 'player has' : 'players have'} joined. Cancel this game?`,
                  )
                ) {
                  cancelGame();
                }
              }}
            >
              Cancel game
            </button>
            <button
              className="btn primary"
              onClick={startGame}
              disabled={players.length === 0}
            >
              Start game
            </button>
          </div>
        </div>
        <ul className="player-chips">
          {players.map((p) => (
            <li
              key={p.id}
              className={`chip${p.connected ? '' : ' offline'}`}
              title={p.connected ? undefined : 'Disconnected — can rejoin'}
            >
              <AvatarBadge id={p.avatar} className="chip-avatar" />
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
  const progress = useStore((s) => s.answeredProgress);
  const skip = useStore((s) => s.skipQuestion);
  useEffect(() => {
    playSound('questionStart');
  }, [q?.index]);
  if (!q) return null;
  const hurry = remainingMs <= LOW_TIME_MS;
  return (
    <div className="screen host-question">
      {hurry && <div className="hurry-glow" aria-hidden="true" />}
      <div className="q-head">
        <span className="q-count">
          Question {q.index + 1} of {q.total}
        </span>
        <Countdown remainingMs={remainingMs} totalMs={q.timeLimitSec * 1000} />
      </div>
      <div className="q-stage" key={q.index}>
        <div className="q-text q-enter">
          <RichText text={q.text} />
        </div>
        {q.type === 'fill' || q.type === 'open' ? (
          <p className="type-prompt">
            {q.type === 'fill'
              ? '✏️ Fill in the blank on your device'
              : '✏️ Type your answer on your device'}
          </p>
        ) : q.type === 'puzzle' ? (
          <PuzzleBoard prompts={q.prompts ?? []} options={q.options} big />
        ) : (
          <AnswerTiles
            options={q.options}
            big
            variant={q.type === 'boolean' ? 'boolean' : 'multiple'}
          />
        )}
      </div>
      <div className="host-controls">
        {progress && (
          <span className="answered-pill" aria-live="polite">
            <strong>{progress.answered}</strong> / {progress.total} answered
          </span>
        )}
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
      <div className="q-text">
        <RichText text={q.text} />
      </div>
      <RevealAnswer reveal={reveal} />
      <div className="reveal-lb">
        <h2>Leaderboard</h2>
        <AnimatedLeaderboard
          entries={reveal.leaderboard}
          maxPossible={reveal.maxPossible}
          limit={10}
        />
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

/** The answer key and how the class answered, in the form each type needs. */
function RevealAnswer({ reveal }: { reveal: RevealData }) {
  const playerCount = useStore((s) => s.players.length);
  switch (reveal.type) {
    case 'multiple':
    case 'boolean':
      return (
        <AnswerTiles
          options={reveal.options}
          correctIndex={reveal.correctIndex}
          distribution={reveal.distribution}
          big
          variant={reveal.type}
        />
      );
    case 'fill':
      return (
        <div className="reveal-typed">
          <AcceptedAnswers
            answers={reveal.answers}
            correctCount={reveal.correctCount}
            playerCount={playerCount}
          />
          <ResponseCloud responses={reveal.responses} />
        </div>
      );
    case 'open':
      return (
        <div className="reveal-typed">
          <ResponseCloud responses={reveal.responses} />
        </div>
      );
    case 'puzzle':
      return (
        <PuzzleKey
          pairs={reveal.pairs}
          pairCorrect={reveal.pairCorrect}
          playerCount={playerCount}
        />
      );
  }
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
      <Confetti />
      <h1 className="logo">Final results</h1>
      <div className="podium">
        {top.map((e, i) => (
          <div
            key={e.nickname}
            className={`podium-spot rank-${e.rank}`}
            style={{ animationDelay: `${i * 0.25}s` }}
          >
            <AvatarBadge id={e.avatar} className="podium-avatar" />
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
      <SaveReport />
      <button className="btn ghost" onClick={reset}>
        New game
      </button>
    </div>
  );
}

/**
 * The host's copy: standings plus how the class did on each question. Same
 * one-chance-to-keep-it reasoning as the players' study sheet.
 */
function SaveReport() {
  const report = useStore((s) => s.hostReport);
  if (!report || report.questions.length === 0) return null;
  return (
    <div className="save-results">
      <p className="save-hint">
        Students can save their own results on their devices. Your copy:
      </p>
      <div className="save-actions">
        <button
          className="btn primary"
          onClick={() =>
            downloadFile(
              classReportName(report, 'html'),
              'text/html;charset=utf-8',
              classReportHtml(report),
            )
          }
          title="Final standings plus per-question class accuracy, hardest first"
        >
          ⬇ Class report
        </button>
        <button
          className="btn ghost"
          onClick={() =>
            downloadFile(
              classReportName(report, 'csv'),
              'text/csv;charset=utf-8',
              classReportCsv(report),
            )
          }
          title="The same report as a spreadsheet"
        >
          ⬇ .csv
        </button>
      </div>
    </div>
  );
}
