import { useState } from 'react';
import type { Quiz } from '@cadoot/shared';
import { tileStyle } from '../theme';
import {
  draftToQuiz,
  emptyDraft,
  emptyDraftQuestion,
  type DraftQuestion,
} from '../quizDraft';

export default function QuizBuilder({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (quiz: Quiz) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(emptyDraft().title);
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    emptyDraft().questions,
  );
  const [errors, setErrors] = useState<string[]>([]);

  function update(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function setOption(i: number, oi: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === i
          ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) }
          : q,
      ),
    );
  }

  function build() {
    return draftToQuiz({ title, questions });
  }

  function submit() {
    const { quiz, problems } = build();
    if (!quiz) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    onSubmit(quiz);
  }

  function download() {
    const { quiz, problems } = build();
    if (!quiz) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    const blob = new Blob([JSON.stringify(quiz, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quiz.title.replace(/[^a-z0-9-_ ]/gi, '_').trim() || 'quiz'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="screen builder">
      <button className="link-btn back" onClick={onCancel} disabled={busy}>
        ← Back
      </button>
      <h1 className="logo small">Create a quiz</h1>

      <label className="builder-title">
        Quiz title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      {questions.map((q, i) => (
        <div className="card builder-card" key={i}>
          <div className="builder-q-head">
            <h3>Question {i + 1}</h3>
            {questions.length > 1 && (
              <button
                type="button"
                className="link-btn danger"
                onClick={() =>
                  setQuestions((qs) => qs.filter((_, idx) => idx !== i))
                }
              >
                Remove
              </button>
            )}
          </div>

          <input
            className="builder-qtext"
            placeholder="Question text"
            value={q.text}
            onChange={(e) => update(i, { text: e.target.value })}
          />

          <div className="builder-type" role="group" aria-label="Question type">
            <button
              type="button"
              className={q.type === 'multiple' ? 'active' : ''}
              onClick={() => update(i, { type: 'multiple' })}
            >
              Multiple choice
            </button>
            <button
              type="button"
              className={q.type === 'boolean' ? 'active' : ''}
              onClick={() =>
                update(i, {
                  type: 'boolean',
                  correctIndex: q.correctIndex === 1 ? 1 : 0,
                })
              }
            >
              True / False
            </button>
          </div>

          <p className="muted small">Tap the circle to mark the correct answer.</p>
          {q.type === 'boolean'
            ? ['True', 'False'].map((label, oi) => {
                const st = tileStyle(oi, 'boolean');
                return (
                  <div className="builder-option" key={oi}>
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correctIndex === oi}
                      onChange={() => update(i, { correctIndex: oi })}
                      aria-label={`Mark ${label} correct`}
                    />
                    <span
                      className="builder-shape"
                      style={{ color: st.color }}
                      aria-hidden="true"
                    >
                      {st.shape}
                    </span>
                    <span className="builder-bool-label">{label}</span>
                  </div>
                );
              })
            : q.options.map((opt, oi) => {
                const st = tileStyle(oi, 'multiple');
                return (
                  <div className="builder-option" key={oi}>
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correctIndex === oi}
                      onChange={() => update(i, { correctIndex: oi })}
                      aria-label={`Mark option ${oi + 1} correct`}
                    />
                    <span
                      className="builder-shape"
                      style={{ color: st.color }}
                      aria-hidden="true"
                    >
                      {st.shape}
                    </span>
                    <input
                      type="text"
                      value={opt}
                      placeholder={`Option ${oi + 1}${oi >= 2 ? ' (optional)' : ''}`}
                      onChange={(e) => setOption(i, oi, e.target.value)}
                    />
                  </div>
                );
              })}

          <label className="builder-time">
            Time limit (seconds)
            <input
              type="number"
              min={5}
              max={300}
              value={q.timeLimitSec}
              onChange={(e) =>
                update(i, { timeLimitSec: Number(e.target.value) })
              }
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        className="btn ghost add-q"
        onClick={() => setQuestions((qs) => [...qs, emptyDraftQuestion()])}
      >
        + Add question
      </button>

      {errors.length > 0 && (
        <div className="file-errors">
          <strong>Please fix:</strong>
          <ul>
            {errors.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="builder-footer">
        <button
          type="button"
          className="btn ghost"
          onClick={download}
          disabled={busy}
          title="Save this quiz as a .json file to reuse next time"
        >
          Download .json
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={submit}
          disabled={busy}
        >
          Create game
        </button>
      </div>
    </div>
  );
}
