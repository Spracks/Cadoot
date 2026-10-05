import { describe, it, expect } from 'vitest';
import { isChoice, type ChoiceQuestion, type Question } from '@cadoot/shared';
import {
  draftToQuiz,
  emptyDraft,
  emptyDraftQuestion,
  type Draft,
  type DraftQuestion,
} from './quizDraft';

/** A draft question: blank in every field except those given. */
function dq(fields: Partial<DraftQuestion>): DraftQuestion {
  return { ...emptyDraftQuestion(), ...fields };
}

/** Narrow a built question to multiple choice / true-false, or fail. */
function choice(q: Question | undefined): ChoiceQuestion {
  if (!q || !isChoice(q)) throw new Error(`expected a choice question, got ${q?.type}`);
  return q;
}

describe('draftToQuiz', () => {
  it('builds a valid quiz and drops blank option slots', () => {
    const draft: Draft = {
      title: 'Manual',
      questions: [
        dq({
          text: 'Pick B',
          type: 'multiple',
          options: ['A', 'B', '', ''],
          correctIndex: 1,
          timeLimitSec: 20,
        }),
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(problems).toEqual([]);
    expect(quiz).not.toBeNull();
    expect(choice(quiz!.questions[0]).options).toEqual(['A', 'B']);
    expect(choice(quiz!.questions[0]).correctIndex).toBe(1);
  });

  it('remaps correctIndex after earlier blank slots are removed', () => {
    const draft: Draft = {
      title: 'Gaps',
      questions: [
        dq({
          text: 'Q',
          type: 'multiple',
          options: ['A', '', 'C', ''],
          correctIndex: 2,
          timeLimitSec: 15,
        }),
      ],
    };
    const { quiz } = draftToQuiz(draft);
    expect(choice(quiz!.questions[0]).options).toEqual(['A', 'C']);
    expect(choice(quiz!.questions[0]).correctIndex).toBe(1);
  });

  it('builds a true/false question', () => {
    const draft: Draft = {
      title: 'TF',
      questions: [
        dq({
          text: 'The sky is blue.',
          type: 'boolean',
          options: [],
          correctIndex: 0,
          timeLimitSec: 15,
        }),
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(problems).toEqual([]);
    expect(quiz!.questions[0]!.type).toBe('boolean');
    expect(choice(quiz!.questions[0]).options).toEqual(['True', 'False']);
    expect(choice(quiz!.questions[0]).correctIndex).toBe(0);
  });

  it('flags a question with fewer than 2 options', () => {
    const draft: Draft = {
      title: 'Bad',
      questions: [
        dq({
          text: 'Q',
          type: 'multiple',
          options: ['only', '', '', ''],
          correctIndex: 0,
          timeLimitSec: 20,
        }),
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(quiz).toBeNull();
    expect(problems.join(' ')).toMatch(/at least 2 options/);
  });

  it('flags when the option marked correct is blank', () => {
    const draft: Draft = {
      title: 'Bad correct',
      questions: [
        dq({
          text: 'Q',
          type: 'multiple',
          options: ['A', 'B', '', ''],
          correctIndex: 2,
          timeLimitSec: 20,
        }),
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(quiz).toBeNull();
    expect(problems.join(' ')).toMatch(/marked correct is empty/);
  });

  it('flags a missing title', () => {
    const draft = emptyDraft();
    draft.title = '  ';
    draft.questions[0] = dq({
      text: 'Q',
      type: 'multiple',
      options: ['A', 'B', '', ''],
      correctIndex: 0,
      timeLimitSec: 20,
    });
    const { quiz, problems } = draftToQuiz(draft);
    expect(quiz).toBeNull();
    expect(problems.join(' ')).toMatch(/title/i);
  });
});

describe('draftToQuiz: fill-in-the-blank, open-ended and puzzle', () => {
  const build = (q: DraftQuestion) => draftToQuiz({ title: 'T', questions: [q] });

  it('keeps the filled accepted answers of a fill-in-the-blank', () => {
    const { quiz, problems } = build(
      dq({ type: 'fill', text: 'Capital of France: ___', answers: [' Paris ', '', 'paris france'] }),
    );
    expect(problems).toEqual([]);
    expect(quiz!.questions[0]).toEqual({
      type: 'fill',
      text: 'Capital of France: ___',
      answers: ['Paris', 'paris france'],
      timeLimitSec: 20,
    });
  });

  it('flags a fill-in-the-blank with no accepted answer', () => {
    const { quiz, problems } = build(dq({ type: 'fill', text: 'Q', answers: ['  '] }));
    expect(quiz).toBeNull();
    expect(problems.join(' ')).toMatch(/at least one accepted answer/);
  });

  it('builds an open-ended question with only its text', () => {
    const { quiz } = build(dq({ type: 'open', text: 'Thoughts?', options: ['left', 'over', '', ''] }));
    expect(quiz!.questions[0]).toEqual({ type: 'open', text: 'Thoughts?', timeLimitSec: 20 });
  });

  it('builds a puzzle from its complete pairs, skipping blank rows', () => {
    const { quiz, problems } = build(
      dq({
        type: 'puzzle',
        text: 'Match',
        pairs: [
          { left: 'HTTP', right: '80' },
          { left: '', right: '' },
          { left: 'SSH ', right: ' 22' },
        ],
      }),
    );
    expect(problems).toEqual([]);
    expect(quiz!.questions[0]).toMatchObject({
      type: 'puzzle',
      pairs: [
        { left: 'HTTP', right: '80' },
        { left: 'SSH', right: '22' },
      ],
    });
  });

  it('flags half-filled pairs, too few pairs and duplicate matches', () => {
    const half = build(
      dq({ type: 'puzzle', text: 'Q', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '' }] }),
    );
    expect(half.problems.join(' ')).toMatch(/pair 2 needs both/);

    const few = build(dq({ type: 'puzzle', text: 'Q', pairs: [{ left: 'a', right: '1' }] }));
    expect(few.problems.join(' ')).toMatch(/at least 2 pairs/);

    const dupes = build(
      dq({ type: 'puzzle', text: 'Q', pairs: [{ left: 'a', right: 'X' }, { left: 'b', right: 'x' }] }),
    );
    expect(dupes.problems.join(' ')).toMatch(/each match must be different/);
  });
});
