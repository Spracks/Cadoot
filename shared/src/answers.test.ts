import { describe, it, expect } from 'vitest';
import {
  acceptAnswer,
  buildOutcome,
  gradeAnswer,
  matchesAccepted,
  normalizeAnswer,
  puzzleShuffle,
  tallyResponses,
} from './answers';
import type { Question } from './quiz';

const FILL: Question = {
  type: 'fill',
  text: 'The capital of France is ___.',
  answers: ['Paris'],
  timeLimitSec: 20,
};
const OPEN: Question = { type: 'open', text: 'Thoughts?', timeLimitSec: 20 };
const PUZZLE: Question = {
  type: 'puzzle',
  text: 'Match the ports',
  pairs: [
    { left: 'HTTP', right: '80' },
    { left: 'HTTPS', right: '443' },
    { left: 'SSH', right: '22' },
  ],
  timeLimitSec: 30,
};
const MC: Question = {
  type: 'multiple',
  text: 'Pick b',
  options: ['a', 'b', 'c'],
  correctIndex: 1,
  timeLimitSec: 20,
};

describe('normalizeAnswer / matchesAccepted', () => {
  it('ignores case, spacing and surrounding punctuation', () => {
    expect(matchesAccepted('  PARIS! ', ['Paris'])).toBe(true);
    expect(matchesAccepted('"paris."', ['Paris'])).toBe(true);
    expect(matchesAccepted('new   york', ['New York'])).toBe(true);
    expect(matchesAccepted('Lyon', ['Paris'])).toBe(false);
  });

  it('keeps punctuation inside an answer', () => {
    expect(matchesAccepted('C++', ['c++'])).toBe(true);
    expect(matchesAccepted('C', ['C++'])).toBe(false);
    expect(normalizeAnswer('3.14')).toBe('3.14');
  });

  it('keeps leading punctuation, which can change the meaning', () => {
    expect(normalizeAnswer('!=')).toBe('!=');
    expect(matchesAccepted('=', ['!='])).toBe(false);
    expect(matchesAccepted('-5', ['5'])).toBe(false);
  });

  it('does not let an all-punctuation answer match a blank', () => {
    expect(normalizeAnswer('?')).toBe('?');
    expect(matchesAccepted('?', ['?'])).toBe(true);
  });
});

describe('puzzleShuffle', () => {
  it('never leaves an item beside its partner', () => {
    for (let n = 2; n <= 6; n++) {
      for (let trial = 0; trial < 50; trial++) {
        const order = puzzleShuffle(n);
        expect([...order].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
        order.forEach((v, i) => expect(v).not.toBe(i));
      }
    }
  });
});

describe('acceptAnswer', () => {
  it('accepts an in-range option and rejects anything else', () => {
    expect(acceptAnswer(MC, { optionIndex: 2 }, null)).toEqual({ optionIndex: 2 });
    expect(acceptAnswer(MC, { optionIndex: 3 }, null)).toBeNull();
    expect(acceptAnswer(MC, { optionIndex: 1.5 }, null)).toBeNull();
    expect(acceptAnswer(MC, { text: 'b' }, null)).toBeNull();
    expect(acceptAnswer(MC, null, null)).toBeNull();
  });

  it('accepts the eighth option of an eight-option question', () => {
    const eight: Question = { ...MC, options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
    expect(acceptAnswer(eight, { optionIndex: 7 }, null)).toEqual({ optionIndex: 7 });
    expect(acceptAnswer(eight, { optionIndex: 8 }, null)).toBeNull();
  });

  it('trims and caps typed answers, and refuses blanks', () => {
    expect(acceptAnswer(FILL, { text: '  Paris ' }, null)).toEqual({ text: 'Paris' });
    expect(acceptAnswer(FILL, { text: 'x'.repeat(500) }, null)).toEqual({ text: 'x'.repeat(120) });
    // Open-ended answers get room for a few sentences, line breaks included.
    expect(acceptAnswer(OPEN, { text: 'x'.repeat(900) }, null)).toEqual({ text: 'x'.repeat(500) });
    expect(acceptAnswer(OPEN, { text: 'one\ntwo' }, null)).toEqual({ text: 'one\ntwo' });
    expect(acceptAnswer(FILL, { text: '   ' }, null)).toBeNull();
    expect(acceptAnswer(FILL, { text: 42 }, null)).toBeNull();
  });

  it('translates a puzzle order from shown slots to pair indices', () => {
    // Slot 0 shows pair 2's match, slot 1 shows pair 0's, slot 2 shows pair 1's.
    const shuffle = [2, 0, 1];
    // Beside each prompt the player puts the slot holding its true partner.
    expect(acceptAnswer(PUZZLE, { order: [1, 2, 0] }, shuffle)).toEqual({ order: [0, 1, 2] });
    // Untouched: slot i stays beside prompt i.
    expect(acceptAnswer(PUZZLE, { order: [0, 1, 2] }, shuffle)).toEqual({ order: [2, 0, 1] });
  });

  it('rejects a puzzle order that is not a permutation', () => {
    const shuffle = [2, 0, 1];
    expect(acceptAnswer(PUZZLE, { order: [0, 0, 1] }, shuffle)).toBeNull();
    expect(acceptAnswer(PUZZLE, { order: [0, 1] }, shuffle)).toBeNull();
    expect(acceptAnswer(PUZZLE, { order: [0, 1, 3] }, shuffle)).toBeNull();
    expect(acceptAnswer(PUZZLE, { order: [0, 1, 2] }, null)).toBeNull();
  });
});

describe('gradeAnswer', () => {
  it('grades choice and fill answers all-or-nothing', () => {
    expect(gradeAnswer(MC, { optionIndex: 1 })).toBe(1);
    expect(gradeAnswer(MC, { optionIndex: 0 })).toBe(0);
    expect(gradeAnswer(FILL, { text: 'paris' })).toBe(1);
    expect(gradeAnswer(FILL, { text: 'Lyon' })).toBe(0);
  });

  it('never grades open-ended answers', () => {
    expect(gradeAnswer(OPEN, { text: 'anything' })).toBe(0);
  });

  it('gives puzzles partial credit per pair matched', () => {
    expect(gradeAnswer(PUZZLE, { order: [0, 1, 2] })).toBe(1);
    expect(gradeAnswer(PUZZLE, { order: [0, 2, 1] })).toBeCloseTo(1 / 3);
    expect(gradeAnswer(PUZZLE, { order: [1, 2, 0] })).toBe(0);
  });
});

describe('tallyResponses', () => {
  it('groups equivalent answers, most common first', () => {
    const tally = tallyResponses(['Paris', 'paris.', 'Lyon', 'PARIS'], ['Paris']);
    expect(tally).toEqual([
      { text: 'Paris', count: 3, correct: true },
      { text: 'Lyon', count: 1, correct: false },
    ]);
  });

  it('leaves `correct` off when there is no answer key', () => {
    expect(tallyResponses(['fun'])).toEqual([{ text: 'fun', count: 1 }]);
  });
});

describe('buildOutcome', () => {
  it('counts choices per option', () => {
    const outcome = buildOutcome(MC, [{ optionIndex: 1 }, { optionIndex: 1 }, null]);
    expect(outcome).toMatchObject({ type: 'multiple', correctIndex: 1, distribution: [0, 2, 0] });
  });

  it('tallies typed answers for fill and open questions', () => {
    const fill = buildOutcome(FILL, [{ text: 'Paris' }, { text: 'Rome' }, null]);
    expect(fill).toMatchObject({ type: 'fill', answers: ['Paris'] });
    if (fill.type === 'fill') expect(fill.responses).toHaveLength(2);

    const open = buildOutcome(OPEN, [{ text: 'fun' }, { text: 'Fun!' }]);
    expect(open).toEqual({ type: 'open', responses: [{ text: 'fun', count: 2 }] });
  });

  it('counts how many players matched each puzzle pair', () => {
    const outcome = buildOutcome(PUZZLE, [
      { order: [0, 1, 2] },
      { order: [0, 2, 1] },
      null,
    ]);
    expect(outcome).toMatchObject({ type: 'puzzle', pairCorrect: [2, 1, 1] });
  });
});
