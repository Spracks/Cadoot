import { tileStyle } from '../theme';

interface Props {
  options: string[];
  onPick?: (index: number) => void;
  disabled?: boolean;
  /** When set, the tiles are in "reveal" mode showing the correct answer. */
  correctIndex?: number | null;
  /** The option this player picked (to mark a wrong choice). */
  myPick?: number | null;
  /** Answer counts per option, shown during reveal on the host screen. */
  distribution?: number[] | null;
  /** Larger sizing for the shared/projector screen. */
  big?: boolean;
  /** 'boolean' renders green-check / red-cross True/False tiles. */
  variant?: 'multiple' | 'boolean';
}

export default function AnswerTiles({
  options,
  onPick,
  disabled,
  correctIndex = null,
  myPick = null,
  distribution = null,
  big = false,
  variant = 'multiple',
}: Props) {
  const revealing = correctIndex !== null;
  return (
    <div
      className={`answer-grid${big ? ' big' : ''}${variant === 'boolean' ? ' boolean' : ''}`}
    >
      {options.map((opt, i) => {
        const st = tileStyle(i, variant);
        const isCorrect = revealing && i === correctIndex;
        const isMyWrong = revealing && myPick === i && i !== correctIndex;
        const dim = revealing && !isCorrect;
        const interactive = !!onPick && !revealing && !disabled;
        return (
          <button
            key={i}
            type="button"
            className={
              'tile' +
              (dim ? ' dim' : '') +
              (isCorrect ? ' correct' : '') +
              (isMyWrong ? ' wrong' : '')
            }
            style={{ backgroundColor: st.color }}
            disabled={!interactive}
            onClick={interactive ? () => onPick(i) : undefined}
          >
            <span className="tile-shape" aria-hidden="true">
              {st.shape}
            </span>
            <span className="tile-text">{opt}</span>
            {distribution && (
              <span className="tile-count">{distribution[i] ?? 0}</span>
            )}
            {isCorrect && <span className="tile-badge">✓</span>}
            {isMyWrong && <span className="tile-badge">✕</span>}
          </button>
        );
      })}
    </div>
  );
}
