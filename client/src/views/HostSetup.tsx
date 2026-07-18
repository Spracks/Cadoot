import { useRef, useState, type ChangeEvent } from 'react';
import { parseQuizByFilename, type Quiz } from '@cadoot/shared';
import { useStore } from '../store';
import { SAMPLE_QUIZ } from '../sampleQuiz';
import QuizBuilder from './QuizBuilder';

export default function HostSetup() {
  const hostCreate = useStore((s) => s.hostCreate);
  const setRole = useStore((s) => s.setRole);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'choose' | 'manual'>('choose');
  const [fileErrors, setFileErrors] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function create(quiz: Quiz) {
    setBusy(true);
    try {
      await hostCreate(quiz);
    } catch {
      /* surfaced via the error banner */
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setFileErrors(null);
    const text = await file.text();
    const result = parseQuizByFilename(file.name, text);
    if (!result.ok) {
      setFileErrors(result.errors);
      return;
    }
    await create(result.quiz);
  }

  if (mode === 'manual') {
    return (
      <QuizBuilder
        onSubmit={create}
        onCancel={() => setMode('choose')}
        busy={busy}
      />
    );
  }

  return (
    <div className="screen center">
      <button className="link-btn back" onClick={() => setRole('none')}>
        ← Back
      </button>
      <h1 className="logo small">Host a game</h1>
      <div className="card setup-card">
        <h2>Choose your questions</h2>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => create(SAMPLE_QUIZ)}
        >
          Use sample quiz
        </button>
        <p className="muted small">
          “{SAMPLE_QUIZ.title}” · {SAMPLE_QUIZ.questions.length} questions
        </p>

        <div className="divider">or</div>

        <button
          className="btn ghost"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Load from file (.json / .csv)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv"
          hidden
          onChange={onFile}
        />

        <button
          className="btn ghost"
          disabled={busy}
          onClick={() => setMode('manual')}
        >
          Create questions manually
        </button>

        {fileErrors && (
          <div className="file-errors">
            <strong>Could not load that file:</strong>
            <ul>
              {fileErrors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
