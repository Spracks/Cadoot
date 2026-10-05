import {
  MIN_PUZZLE_PAIRS,
  QuizSchema,
  type PuzzlePair,
  type Quiz,
  type QuestionType,
} from '@cadoot/shared';

/**
 * In-progress question as edited in the manual builder. It holds the fields of
 * every question type at once, so flipping a question's type and back doesn't
 * throw away what the author typed; only the fields for `type` are used.
 */
export interface DraftQuestion {
  text: string;
  type: QuestionType;
  /** Multiple choice: 4 fixed option slots. */
  options: string[];
  /** For 'multiple': index into `options`. For 'boolean': 0 = True, 1 = False. */
  correctIndex: number;
  /** Fill-in-the-blank: accepted answers, one per slot. */
  answers: string[];
  /** Puzzle: left/right pairs, one per row. */
  pairs: PuzzlePair[];
  timeLimitSec: number;
}

export interface Draft {
  title: string;
  questions: DraftQuestion[];
}

/** Most accepted-answer slots the builder offers for one blank. */
export const MAX_DRAFT_ANSWERS = 5;

export const emptyPair = (): PuzzlePair => ({ left: '', right: '' });

export const emptyDraftQuestion = (): DraftQuestion => ({
  text: '',
  type: 'multiple',
  options: ['', '', '', ''],
  correctIndex: 0,
  answers: [''],
  pairs: [emptyPair(), emptyPair(), emptyPair()],
  timeLimitSec: 20,
});

export const emptyDraft = (): Draft => ({
  title: 'My Quiz',
  questions: [emptyDraftQuestion()],
});

/**
 * Turn an editor draft into a validated Quiz. Blank option slots are dropped;
 * the "correct" selection follows its option after blanks are removed. Returns
 * friendly, per-question problems instead of raw schema errors when possible,
 * then falls back to the shared QuizSchema as the source of truth.
 */
export function draftToQuiz(draft: Draft): {
  quiz: Quiz | null;
  problems: string[];
} {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push('Add a quiz title.');
  if (draft.questions.length === 0) problems.push('Add at least one question.');

  const questions = draft.questions.map((q, i) => {
    const n = i + 1;
    const text = q.text.trim();
    const timeLimitSec = q.timeLimitSec;
    if (!text) problems.push(`Question ${n}: add the question text.`);

    switch (q.type) {
      case 'boolean':
        return {
          type: 'boolean' as const,
          text,
          options: ['True', 'False'],
          correctIndex: q.correctIndex === 1 ? 1 : 0,
          timeLimitSec,
        };

      case 'fill': {
        const answers = q.answers.map((a) => a.trim()).filter((a) => a.length > 0);
        if (answers.length === 0) {
          problems.push(`Question ${n}: add at least one accepted answer.`);
        }
        return { type: 'fill' as const, text, answers, timeLimitSec };
      }

      case 'open':
        return { type: 'open' as const, text, timeLimitSec };

      case 'puzzle': {
        const pairs = q.pairs
          .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
          .filter((p) => p.left || p.right);
        pairs.forEach((p, k) => {
          if (!p.left || !p.right) {
            problems.push(`Question ${n}: pair ${k + 1} needs both an item and its match.`);
          }
        });
        if (pairs.length < MIN_PUZZLE_PAIRS) {
          problems.push(`Question ${n}: add at least ${MIN_PUZZLE_PAIRS} pairs.`);
        }
        const rights = pairs.map((p) => p.right.toLowerCase()).filter(Boolean);
        if (new Set(rights).size !== rights.length) {
          problems.push(`Question ${n}: each match must be different.`);
        }
        return { type: 'puzzle' as const, text, pairs, timeLimitSec };
      }

      case 'multiple': {
        const filled = q.options
          .map((t, idx) => ({ text: t.trim(), idx }))
          .filter((o) => o.text.length > 0);
        if (filled.length < 2) problems.push(`Question ${n}: add at least 2 options.`);
        const correct = filled.findIndex((o) => o.idx === q.correctIndex);
        if (filled.length >= 2 && correct === -1) {
          problems.push(
            `Question ${n}: the option marked correct is empty — pick a filled option.`,
          );
        }
        return {
          type: 'multiple' as const,
          text,
          options: filled.map((o) => o.text),
          correctIndex: Math.max(0, correct),
          timeLimitSec,
        };
      }
    }
  });

  if (problems.length > 0) return { quiz: null, problems };

  const parsed = QuizSchema.safeParse({ title: draft.title.trim(), questions });
  if (!parsed.success) {
    return { quiz: null, problems: parsed.error.issues.map((iss) => iss.message) };
  }
  return { quiz: parsed.data, problems: [] };
}
