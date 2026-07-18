import { describe, it, expect } from 'vitest';
import { draftToQuiz, emptyDraft, type Draft } from './quizDraft';

describe('draftToQuiz', () => {
  it('builds a valid quiz and drops blank option slots', () => {
    const draft: Draft = {
      title: 'Manual',
      questions: [
        {
          text: 'Pick B',
          type: 'multiple',
          options: ['A', 'B', '', ''],
          correctIndex: 1,
          timeLimitSec: 20,
        },
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(problems).toEqual([]);
    expect(quiz).not.toBeNull();
    expect(quiz!.questions[0]!.options).toEqual(['A', 'B']);
    expect(quiz!.questions[0]!.correctIndex).toBe(1);
  });

  it('remaps correctIndex after earlier blank slots are removed', () => {
    const draft: Draft = {
      title: 'Gaps',
      questions: [
        {
          text: 'Q',
          type: 'multiple',
          options: ['A', '', 'C', ''],
          correctIndex: 2,
          timeLimitSec: 15,
        },
      ],
    };
    const { quiz } = draftToQuiz(draft);
    expect(quiz!.questions[0]!.options).toEqual(['A', 'C']);
    expect(quiz!.questions[0]!.correctIndex).toBe(1);
  });

  it('builds a true/false question', () => {
    const draft: Draft = {
      title: 'TF',
      questions: [
        {
          text: 'The sky is blue.',
          type: 'boolean',
          options: [],
          correctIndex: 0,
          timeLimitSec: 15,
        },
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(problems).toEqual([]);
    expect(quiz!.questions[0]!.type).toBe('boolean');
    expect(quiz!.questions[0]!.options).toEqual(['True', 'False']);
    expect(quiz!.questions[0]!.correctIndex).toBe(0);
  });

  it('flags a question with fewer than 2 options', () => {
    const draft: Draft = {
      title: 'Bad',
      questions: [
        {
          text: 'Q',
          type: 'multiple',
          options: ['only', '', '', ''],
          correctIndex: 0,
          timeLimitSec: 20,
        },
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
        {
          text: 'Q',
          type: 'multiple',
          options: ['A', 'B', '', ''],
          correctIndex: 2,
          timeLimitSec: 20,
        },
      ],
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(quiz).toBeNull();
    expect(problems.join(' ')).toMatch(/marked correct is empty/);
  });

  it('flags a missing title', () => {
    const draft = emptyDraft();
    draft.title = '  ';
    draft.questions[0] = {
      text: 'Q',
      type: 'multiple',
      options: ['A', 'B', '', ''],
      correctIndex: 0,
      timeLimitSec: 20,
    };
    const { quiz, problems } = draftToQuiz(draft);
    expect(quiz).toBeNull();
    expect(problems.join(' ')).toMatch(/title/i);
  });
});
