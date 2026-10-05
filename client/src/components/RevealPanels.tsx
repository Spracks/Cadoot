import type { PuzzlePair, ResponseTally } from '@cadoot/shared';
import { answerStyle } from '../theme';
import RichText from './RichText';

/** Most typed responses shown on the shared screen at once. */
const SHOWN_RESPONSES = 24;
/** Responses longer than this many characters are shown as cards, not pills. */
const LONG_RESPONSE = 40;

/**
 * Typed answers on the shared screen, grouped and sized by how many players
 * gave each one — a quick read of what the room thinks. Never shows who wrote
 * what.
 */
export function ResponseCloud({ responses }: { responses: ResponseTally[] }) {
  if (responses.length === 0) {
    return <p className="responses-empty">No answers this time.</p>;
  }
  const top = Math.max(...responses.map((r) => r.count));
  return (
    <ul className="responses">
      {responses.slice(0, SHOWN_RESPONSES).map((r, i) => {
        // Sentences become plain cards; only short answers scale with votes.
        const long = r.text.length > LONG_RESPONSE || r.text.includes('\n');
        return (
          <li
            key={i}
            className={
              'response' +
              (long ? ' long' : '') +
              (r.correct === true ? ' good' : r.correct === false ? ' bad' : '')
            }
            // Scale between 1× and 2× by share of the most popular answer.
            style={long ? undefined : { fontSize: `${1 + r.count / top}em` }}
          >
            {r.correct === true && (
              <span className="response-mark" aria-label="accepted">
                ✓
              </span>
            )}
            <span className="response-text">{r.text}</span>
            {r.count > 1 && <span className="response-count">×{r.count}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** The accepted answer(s) to a fill-in-the-blank, shown big at reveal. */
export function AcceptedAnswers({
  answers,
  correctCount,
  playerCount,
}: {
  answers: string[];
  correctCount: number;
  playerCount: number;
}) {
  return (
    <div className="accepted">
      <span className="accepted-label">
        {answers.length > 1 ? 'Accepted answers' : 'Answer'}
      </span>
      <span className="accepted-text">
        {answers.map((a, i) => (
          <span key={i}>
            {i > 0 && <span className="accepted-sep"> / </span>}
            <RichText text={a} inline />
          </span>
        ))}
      </span>
      <span className="accepted-count">
        {correctCount} of {playerCount} got it
      </span>
    </div>
  );
}

/** A puzzle's answer key, with how many players matched each pair. */
export function PuzzleKey({
  pairs,
  pairCorrect,
  playerCount,
}: {
  pairs: PuzzlePair[];
  pairCorrect: number[];
  playerCount: number;
}) {
  return (
    <div className="puzzle big puzzle-key">
      <ol className="puzzle-rows">
        {pairs.map((p, i) => {
          const st = answerStyle(i);
          return (
            <li key={i} className="puzzle-row">
              <div className="puzzle-prompt" style={{ backgroundColor: st.color }}>
                <span className="tile-shape" aria-hidden="true">
                  {st.shape}
                </span>
                <span className="puzzle-text">
                  <RichText text={p.left} inline />
                </span>
              </div>
              <span className="puzzle-link" aria-hidden="true">
                ⟷
              </span>
              <div className="puzzle-card static correct">
                <span className="puzzle-text">
                  <RichText text={p.right} inline />
                </span>
                <span className="tile-count" title="Players who matched this pair">
                  {pairCorrect[i] ?? 0}/{playerCount}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
