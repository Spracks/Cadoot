import { describe, it, expect } from 'vitest';
import { parseQuizJson, parseQuizCsv, parseQuizByFilename } from './parse';
import { isChoice, type ChoiceQuestion, type Question } from './quiz';

/** Narrow a parsed question to multiple choice / true-false, or fail. */
function choice(q: Question | undefined): ChoiceQuestion {
  if (!q || !isChoice(q)) throw new Error(`expected a choice question, got ${q?.type}`);
  return q;
}

describe('parseQuizJson', () => {
  it('parses a valid quiz', () => {
    const text = JSON.stringify({
      title: 'Test',
      questions: [
        { text: 'Q1', options: ['a', 'b'], correctIndex: 1, timeLimitSec: 15 },
      ],
    });
    const result = parseQuizJson(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quiz.title).toBe('Test');
      expect(choice(result.quiz.questions[0]).correctIndex).toBe(1);
    }
  });

  it('applies the default time limit', () => {
    const text = JSON.stringify({
      title: 'Test',
      questions: [{ text: 'Q1', options: ['a', 'b'], correctIndex: 0 }],
    });
    const result = parseQuizJson(text);
    expect(result.ok && result.quiz.questions[0]!.timeLimitSec).toBe(20);
  });

  it('reports invalid JSON', () => {
    const result = parseQuizJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/Invalid JSON/);
  });

  it('rejects a correctIndex out of range', () => {
    const text = JSON.stringify({
      title: 'Test',
      questions: [{ text: 'Q1', options: ['a', 'b'], correctIndex: 5 }],
    });
    const result = parseQuizJson(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/correctIndex/);
  });

  it('rejects a quiz with no questions', () => {
    const result = parseQuizJson(JSON.stringify({ title: 'Empty', questions: [] }));
    expect(result.ok).toBe(false);
  });

  it('expands a true/false shorthand ({ type, correct })', () => {
    const text = JSON.stringify({
      title: 'TF',
      questions: [{ type: 'boolean', text: 'Water is wet.', correct: true }],
    });
    const result = parseQuizJson(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const q = choice(result.quiz.questions[0]);
      expect(q.type).toBe('boolean');
      expect(q.options).toEqual(['True', 'False']);
      expect(q.correctIndex).toBe(0);
    }
  });

  it('defaults question type to multiple', () => {
    const text = JSON.stringify({
      title: 'MC',
      questions: [{ text: 'Q', options: ['a', 'b'], correctIndex: 0 }],
    });
    const result = parseQuizJson(text);
    expect(result.ok && result.quiz.questions[0]!.type).toBe('multiple');
  });
});

describe('parseQuizCsv', () => {
  const csv = [
    'question,option1,option2,option3,option4,correct,timeLimitSec',
    'What is 2+2?,3,4,5,6,2,10',
    'Sky color?,Blue,Green,,,1,',
  ].join('\n');

  it('parses a valid CSV and converts 1-based correct to 0-based', () => {
    const result = parseQuizCsv(csv, 'Math');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quiz.title).toBe('Math');
      expect(result.quiz.questions).toHaveLength(2);
      expect(choice(result.quiz.questions[0]).correctIndex).toBe(1); // "4"
      expect(result.quiz.questions[0]!.timeLimitSec).toBe(10);
      expect(choice(result.quiz.questions[1]).options).toEqual(['Blue', 'Green']);
      expect(result.quiz.questions[1]!.timeLimitSec).toBe(20); // default
    }
  });

  it('reports a missing correct column value', () => {
    const bad = ['question,option1,option2,correct', 'Q1,a,b,'].join('\n');
    const result = parseQuizCsv(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/correct/i);
  });

  it('supports a true/false question via the type column', () => {
    const csv = [
      'question,type,correct',
      'The earth is flat.,boolean,false',
    ].join('\n');
    const result = parseQuizCsv(csv, 'Geo');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const q = choice(result.quiz.questions[0]);
      expect(q.type).toBe('boolean');
      expect(q.options).toEqual(['True', 'False']);
      expect(q.correctIndex).toBe(1); // false -> index 1
    }
  });
});

describe('new question types', () => {
  it('parses fill-in-the-blank, open-ended and puzzle questions from JSON', () => {
    const text = JSON.stringify({
      title: 'Mixed',
      questions: [
        { type: 'fill', text: 'The capital of France is ___.', answers: ['Paris'] },
        { type: 'open', text: 'What did you learn today?' },
        {
          type: 'puzzle',
          text: 'Match the port to the protocol',
          pairs: [
            { left: 'HTTP', right: '80' },
            { left: 'HTTPS', right: '443' },
          ],
        },
      ],
    });
    const result = parseQuizJson(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quiz.questions.map((q) => q.type)).toEqual(['fill', 'open', 'puzzle']);
    expect(result.quiz.questions[2]).toMatchObject({ pairs: [{ left: 'HTTP' }, { left: 'HTTPS' }] });
  });

  it('rejects a fill-in-the-blank with no accepted answers', () => {
    const result = parseQuizJson(
      JSON.stringify({ title: 'T', questions: [{ type: 'fill', text: 'Q', answers: [] }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/at least 1 accepted answer/);
  });

  it('rejects a puzzle with one pair or duplicate matches', () => {
    const onePair = parseQuizJson(
      JSON.stringify({
        title: 'T',
        questions: [{ type: 'puzzle', text: 'Q', pairs: [{ left: 'a', right: '1' }] }],
      }),
    );
    expect(onePair.ok).toBe(false);

    const dupes = parseQuizJson(
      JSON.stringify({
        title: 'T',
        questions: [
          {
            type: 'puzzle',
            text: 'Q',
            pairs: [
              { left: 'a', right: 'Same' },
              { left: 'b', right: 'same' },
            ],
          },
        ],
      }),
    );
    expect(dupes.ok).toBe(false);
    if (!dupes.ok) expect(dupes.errors.join(' ')).toMatch(/must be different/);
  });

  it('reads the new types from CSV', () => {
    const csv = [
      'question,type,option1,option2,option3,correct',
      'Capital of France is ___,fill,Paris,paris france,,',
      'Any thoughts?,open,,,,',
      'Match ports,puzzle,HTTP | 80,HTTPS | 443,SSH|22,',
    ].join('\n');
    const result = parseQuizCsv(csv, 'Mixed');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [fill, open, puzzle] = result.quiz.questions;
    expect(fill).toMatchObject({ type: 'fill', answers: ['Paris', 'paris france'] });
    expect(open).toMatchObject({ type: 'open' });
    expect(puzzle).toMatchObject({
      type: 'puzzle',
      pairs: [
        { left: 'HTTP', right: '80' },
        { left: 'HTTPS', right: '443' },
        { left: 'SSH', right: '22' },
      ],
    });
  });

  it('explains a CSV puzzle cell with no separator and an unknown type', () => {
    const csv = [
      'question,type,option1,option2',
      'Match,puzzle,HTTP 80,HTTPS | 443',
      'Huh,essay,a,b',
    ].join('\n');
    const result = parseQuizCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/Row 2: puzzle pairs/);
    expect(result.errors.join(' ')).toMatch(/Row 3: unknown question type "essay"/);
  });
});

describe('parseQuizByFilename', () => {
  it('routes .csv to the CSV parser and uses the base name as title', () => {
    const csv = 'question,option1,option2,correct\nQ1,a,b,1';
    const result = parseQuizByFilename('capitals.csv', csv);
    expect(result.ok && result.quiz.title).toBe('capitals');
  });

  it('rejects unknown extensions', () => {
    const result = parseQuizByFilename('quiz.txt', 'whatever');
    expect(result.ok).toBe(false);
  });
});
