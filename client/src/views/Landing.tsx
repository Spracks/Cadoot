import { useStore } from '../store';

export default function Landing() {
  const setRole = useStore((s) => s.setRole);
  return (
    <div className="screen center">
      <div className="brand">
        <h1 className="logo">Cadoot</h1>
        <p className="tagline">Live classroom quizzes — join with a PIN and play.</p>
      </div>
      <div className="landing-actions">
        <button
          className="btn primary big-btn"
          onClick={() => setRole('player')}
        >
          Join a game
        </button>
        <button className="btn ghost big-btn" onClick={() => setRole('host')}>
          Host a game
        </button>
      </div>
      <p className="footnote">
        Runs entirely on your local network. Nothing is saved.
      </p>
    </div>
  );
}
