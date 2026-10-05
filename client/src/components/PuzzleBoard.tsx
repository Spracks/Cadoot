import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { answerStyle } from '../theme';
import RichText from './RichText';

interface Props {
  /** Left-hand items, fixed in place. */
  prompts: string[];
  /** Right-hand items in the order they're first shown (already shuffled). */
  options: string[];
  /**
   * Called with, for each prompt, the index into `options` placed beside it.
   * Leave it off for a read-only board (the shared screen).
   */
  onSubmit?: (order: number[]) => void;
  /** Larger sizing for the shared/projector screen. */
  big?: boolean;
}

/** Pixels a press has to travel before it counts as a drag, not a tap. */
const DRAG_THRESHOLD = 6;

interface Drag {
  row: number;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  /** False until the pointer has moved far enough to be a drag. */
  moved: boolean;
}

/**
 * A matching puzzle: drag each right-hand card beside the left-hand item it
 * belongs with. Dropping a card on another row swaps the two, so every row
 * always holds exactly one card.
 *
 * Built on pointer events rather than HTML drag-and-drop, which doesn't fire
 * for touch on most phones. Tapping two cards also swaps them, and so does
 * pressing Enter/Space on two cards in turn — no drag required.
 */
export default function PuzzleBoard({ prompts, options, onSubmit, big = false }: Props) {
  // order[row] = index into `options` of the card sitting in that row.
  const [order, setOrder] = useState(() => options.map((_, i) => i));
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [swapped, setSwapped] = useState<number[]>([]);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const interactive = !!onSubmit;

  function swap(a: number, b: number) {
    setOrder((o) => {
      const next = [...o];
      [next[a], next[b]] = [next[b]!, next[a]!];
      return next;
    });
    setSwapped([a, b]);
  }

  /** Tap (or keyboard) selection: the second pick swaps with the first. */
  function pick(row: number) {
    if (selected === null) setSelected(row);
    else {
      if (selected !== row) swap(selected, row);
      setSelected(null);
    }
  }

  /** The row under a screen y-coordinate, if any. */
  function rowAt(y: number): number | null {
    const i = rowRefs.current.findIndex((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    return i === -1 ? null : i;
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, row: number) {
    if (!e.isPrimary || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      row,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    });
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const moved = drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    setDrag({ ...drag, dx, dy, moved });
    if (moved) {
      setSelected(null);
      setOver(rowAt(e.clientY));
    }
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      const target = rowAt(e.clientY);
      if (target !== null && target !== drag.row) swap(drag.row, target);
    } else {
      pick(drag.row);
    }
    setDrag(null);
    setOver(null);
  }

  function onPointerCancel() {
    setDrag(null);
    setOver(null);
  }

  /** Keyboard activation only; pointer taps are handled in onPointerUp. */
  function onClick(e: MouseEvent<HTMLButtonElement>, row: number) {
    if (e.detail === 0) pick(row);
  }

  return (
    <div className={`puzzle${big ? ' big' : ''}`}>
      {interactive && (
        <p className="puzzle-hint">
          Drag each card next to its match — or tap two cards to swap them.
        </p>
      )}
      <ol className="puzzle-rows">
        {prompts.map((prompt, row) => {
          const st = answerStyle(row);
          const card = order[row]!;
          const dragging = drag?.moved && drag.row === row;
          return (
            <li
              key={row}
              ref={(el) => {
                rowRefs.current[row] = el;
              }}
              className={
                'puzzle-row' +
                (over === row && drag?.row !== row ? ' over' : '')
              }
            >
              <div className="puzzle-prompt" style={{ backgroundColor: st.color }}>
                <span className="tile-shape" aria-hidden="true">
                  {st.shape}
                </span>
                <span className="puzzle-text">
                  <RichText text={prompt} inline />
                </span>
              </div>
              <span className="puzzle-link" aria-hidden="true">
                ⟷
              </span>
              {interactive ? (
                <button
                  type="button"
                  className={
                    'puzzle-card' +
                    (selected === row ? ' selected' : '') +
                    (dragging ? ' dragging' : '') +
                    (swapped.includes(row) && !drag ? ' swapped' : '')
                  }
                  style={
                    dragging
                      ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` }
                      : undefined
                  }
                  aria-pressed={selected === row}
                  aria-label={`${options[card]} — matched with ${prompt}. Select, then select another card to swap.`}
                  onPointerDown={(e) => onPointerDown(e, row)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onClick={(e) => onClick(e, row)}
                  onAnimationEnd={() => setSwapped([])}
                >
                  <span className="puzzle-grip" aria-hidden="true">
                    ⠿
                  </span>
                  <span className="puzzle-text">
                    <RichText text={options[card]!} inline />
                  </span>
                </button>
              ) : (
                <div className="puzzle-card static">
                  <span className="puzzle-text">
                    <RichText text={options[card]!} inline />
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {interactive && (
        <button className="btn primary puzzle-submit" onClick={() => onSubmit(order)}>
          Lock in answer
        </button>
      )}
    </div>
  );
}
