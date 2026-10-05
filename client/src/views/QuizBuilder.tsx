import { useState } from 'react';
import {
  MAX_OPTIONS,
  MAX_PUZZLE_PAIRS,
  MIN_PUZZLE_PAIRS,
  isChoice,
  type Quiz,
  type QuestionType,
} from '@cadoot/shared';
import { answerStyle, tileStyle } from '../theme';
import { downloadFile, slug } from '../results';
import {
  DEFAULT_OPTION_SLOTS,
  MAX_DRAFT_ANSWERS,
  draftToQuiz,
  emptyDraft,
  emptyDraftQuestion,
  emptyPair,
  removeOption,
  type DraftQuestion,
} from '../quizDraft';

const TYPES: Array<{ type: QuestionType; label: string }> = [
  { type: 'multiple', label: 'Multiple choice' },
  { type: 'boolean', label: 'True / False' },
  { type: 'fill', label: 'Fill in the blank' },
  { type: 'open', label: 'Open-ended' },
  { type: 'puzzle', label: 'Puzzle' },
];

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
    downloadFile(
      `${slug(quiz.title, 'quiz')}.json`,
      'application/json',
      JSON.stringify(quiz, null, 2),
    );
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
            {TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                className={q.type === t.type ? 'active' : ''}
                aria-pressed={q.type === t.type}
                onClick={() =>
                  update(i, {
                    type: t.type,
                    ...(t.type === 'boolean'
                      ? { correctIndex: q.correctIndex === 1 ? 1 : 0 }
                      : {}),
                  })
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {q.type === 'fill' ? (
            <FillEditor q={q} onChange={(patch) => update(i, patch)} />
          ) : q.type === 'open' ? (
            <p className="muted small">
              Players type anything they like. Open-ended questions aren’t
              scored — everyone’s answers appear on the shared screen, without
              names.
            </p>
          ) : q.type === 'puzzle' ? (
            <PuzzleEditor q={q} onChange={(patch) => update(i, patch)} />
          ) : (
            <p className="muted small">Tap the circle to mark the correct answer.</p>
          )}
          {isChoice(q) &&
            (q.type === 'boolean'
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
                    {q.options.length > DEFAULT_OPTION_SLOTS && (
                      <button
                        type="button"
                        className="link-btn danger builder-remove"
                        aria-label={`Remove option ${oi + 1}`}
                        onClick={() =>
                          setQuestions((qs) =>
                            qs.map((x, idx) => (idx === i ? removeOption(x, oi) : x)),
                          )
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              }))}
          {q.type === 'multiple' && q.options.length < MAX_OPTIONS && (
            <button
              type="button"
              className="link-btn builder-add"
              onClick={() => update(i, { options: [...q.options, ''] })}
            >
              + Add option
            </button>
          )}

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

/** Accepted answers for a fill-in-the-blank question. */
function FillEditor({
  q,
  onChange,
}: {
  q: DraftQuestion;
  onChange: (patch: Partial<DraftQuestion>) => void;
}) {
  const setAnswer = (ai: number, value: string) =>
    onChange({ answers: q.answers.map((a, j) => (j === ai ? value : a)) });
  return (
    <>
      <p className="muted small">
        Put <code>___</code> in the question where the blank goes. Any answer
        below counts as correct — capitals, extra spaces and a final full stop
        don’t matter.
      </p>
      {q.answers.map((a, ai) => (
        <div className="builder-option" key={ai}>
          <span className="builder-shape" style={{ color: 'var(--good)' }} aria-hidden="true">
            ✓
          </span>
          <input
            type="text"
            value={a}
            placeholder={ai === 0 ? 'Correct answer' : 'Another accepted answer'}
            aria-label={`Accepted answer ${ai + 1}`}
            onChange={(e) => setAnswer(ai, e.target.value)}
          />
          {q.answers.length > 1 && (
            <button
              type="button"
              className="link-btn danger builder-remove"
              aria-label={`Remove accepted answer ${ai + 1}`}
              onClick={() => onChange({ answers: q.answers.filter((_, j) => j !== ai) })}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {q.answers.length < MAX_DRAFT_ANSWERS && (
        <button
          type="button"
          className="link-btn builder-add"
          onClick={() => onChange({ answers: [...q.answers, ''] })}
        >
          + Accept another spelling
        </button>
      )}
    </>
  );
}

/** Item / match pairs for a puzzle question. */
function PuzzleEditor({
  q,
  onChange,
}: {
  q: DraftQuestion;
  onChange: (patch: Partial<DraftQuestion>) => void;
}) {
  const setPair = (pi: number, side: 'left' | 'right', value: string) =>
    onChange({
      pairs: q.pairs.map((p, j) => (j === pi ? { ...p, [side]: value } : p)),
    });
  return (
    <>
      <p className="muted small">
        Write each item next to its match. Players see the matches shuffled and
        drag them back into line; each pair they get right earns part of the
        points.
      </p>
      {q.pairs.map((p, pi) => {
        const st = answerStyle(pi);
        return (
          <div className="builder-option builder-pair" key={pi}>
            <span className="builder-shape" style={{ color: st.color }} aria-hidden="true">
              {st.shape}
            </span>
            <input
              type="text"
              value={p.left}
              placeholder={`Item ${pi + 1}`}
              aria-label={`Item ${pi + 1}`}
              onChange={(e) => setPair(pi, 'left', e.target.value)}
            />
            <span className="builder-pair-link" aria-hidden="true">
              ⟷
            </span>
            <input
              type="text"
              value={p.right}
              placeholder="Its match"
              aria-label={`Match for item ${pi + 1}`}
              onChange={(e) => setPair(pi, 'right', e.target.value)}
            />
            {q.pairs.length > MIN_PUZZLE_PAIRS && (
              <button
                type="button"
                className="link-btn danger builder-remove"
                aria-label={`Remove pair ${pi + 1}`}
                onClick={() => onChange({ pairs: q.pairs.filter((_, j) => j !== pi) })}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {q.pairs.length < MAX_PUZZLE_PAIRS && (
        <button
          type="button"
          className="link-btn builder-add"
          onClick={() => onChange({ pairs: [...q.pairs, emptyPair()] })}
        >
          + Add pair
        </button>
      )}
    </>
  );
}
