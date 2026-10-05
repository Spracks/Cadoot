import { z } from 'zod';

export type QuestionType = 'multiple' | 'boolean' | 'fill' | 'open' | 'puzzle';
/** The tile-based question types, answered by picking one option. */
export type ChoiceType = 'multiple' | 'boolean';

/** A multiple-choice question offers between 2 and this many options. */
export const MAX_OPTIONS = 8;
/** Longest fill-in-the-blank answer a player may send. */
export const MAX_TEXT_ANSWER = 120;
/** Longest open-ended answer a player may send — room for a few sentences. */
export const MAX_OPEN_ANSWER = 500;
/** Puzzle questions match between this many pairs, inclusive. */
export const MIN_PUZZLE_PAIRS = 2;
export const MAX_PUZZLE_PAIRS = 6;

const common = {
  text: z.string().min(1, 'Question text is required'),
  timeLimitSec: z
    .number()
    .int('timeLimitSec must be a whole number')
    .positive('timeLimitSec must be greater than 0')
    .max(300, 'timeLimitSec cannot exceed 300')
    .default(20),
  points: z.number().int().positive().optional(),
};

/**
 * Multiple-choice and true/false questions: explicit `options` + `correctIndex`
 * (a true/false question is just a 2-option question with type 'boolean').
 *
 * NOTE: correctIndex is 0-based in JSON. The CSV importer accepts a 1-based
 * "correct" column; true/false questions also accept a `correct: true|false`
 * shorthand (see the preprocess below and `parse.ts`).
 */
const ChoiceQuestion = z.object({
  ...common,
  type: z.enum(['multiple', 'boolean']),
  options: z
    .array(z.string().min(1, 'Option text cannot be empty'))
    .min(2, 'A question needs at least 2 options')
    .max(MAX_OPTIONS, `A question can have at most ${MAX_OPTIONS} options`),
  correctIndex: z
    .number({ invalid_type_error: 'correctIndex must be a number' })
    .int('correctIndex must be a whole number')
    .nonnegative('correctIndex cannot be negative'),
});

/**
 * Players type the missing word. Any of `answers` counts as correct; matching
 * ignores case, extra spaces and surrounding punctuation (see `answers.ts`).
 */
const FillQuestion = z.object({
  ...common,
  type: z.literal('fill'),
  answers: z
    .array(z.string().trim().min(1, 'Accepted answers cannot be empty'))
    .min(1, 'A fill-in-the-blank question needs at least 1 accepted answer')
    .max(10, 'A fill-in-the-blank question can have at most 10 accepted answers'),
});

/** Players type anything. Unscored — responses are shown to the class. */
const OpenQuestion = z.object({
  ...common,
  type: z.literal('open'),
});

export const PuzzlePairSchema = z.object({
  left: z.string().min(1, 'Puzzle items cannot be empty'),
  right: z.string().min(1, 'Puzzle matches cannot be empty'),
});

/**
 * Players drag the shuffled right-hand items so each lines up with its
 * left-hand partner. `pairs` is the answer key, in the order shown.
 */
const PuzzleQuestion = z.object({
  ...common,
  type: z.literal('puzzle'),
  pairs: z
    .array(PuzzlePairSchema)
    .min(MIN_PUZZLE_PAIRS, `A puzzle needs at least ${MIN_PUZZLE_PAIRS} pairs`)
    .max(MAX_PUZZLE_PAIRS, `A puzzle can have at most ${MAX_PUZZLE_PAIRS} pairs`),
});

/** The validated, canonical form of a question. */
const CanonicalQuestion = z
  .discriminatedUnion('type', [
    ChoiceQuestion,
    FillQuestion,
    OpenQuestion,
    PuzzleQuestion,
  ])
  .superRefine((q, ctx) => {
    if (q.type === 'multiple' || q.type === 'boolean') {
      if (q.correctIndex >= q.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'correctIndex points past the last option',
          path: ['correctIndex'],
        });
      }
      if (q.type === 'boolean' && q.options.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A true/false question must have exactly 2 options',
          path: ['options'],
        });
      }
    }
    if (q.type === 'puzzle') {
      // Two identical matches would make "which one goes where" unanswerable.
      const rights = q.pairs.map((p) => p.right.trim().toLowerCase());
      if (new Set(rights).size !== rights.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each puzzle match must be different',
          path: ['pairs'],
        });
      }
    }
  });

/**
 * Public question schema. A preprocess step fills in the default type and
 * expands the true/false shorthand (`{ type: 'boolean', correct: true }`) into
 * the canonical options form before validation, so authors don't have to spell
 * out ["True", "False"] by hand.
 */
export const QuestionSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const q = raw as Record<string, unknown>;
    const looksBoolean =
      q.type === 'boolean' ||
      (q.type === undefined &&
        typeof q.correct === 'boolean' &&
        q.options === undefined);
    if (looksBoolean) {
      const options =
        Array.isArray(q.options) && q.options.length === 2
          ? q.options
          : ['True', 'False'];
      const correctIndex =
        typeof q.correct === 'boolean' ? (q.correct ? 0 : 1) : q.correctIndex;
      return { ...q, type: 'boolean', options, correctIndex };
    }
    if (q.type === undefined) return { ...q, type: 'multiple' };
  }
  return raw;
}, CanonicalQuestion);

export const QuizSchema = z.object({
  title: z.string().min(1, 'Quiz title is required'),
  questions: z
    .array(QuestionSchema)
    .min(1, 'A quiz needs at least one question'),
});

export type Question = z.infer<typeof QuestionSchema>;
export type ChoiceQuestion = Extract<Question, { type: ChoiceType }>;
export type PuzzlePair = z.infer<typeof PuzzlePairSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

export function isChoice<Q extends { type: QuestionType }>(
  q: Q,
): q is Q & { type: ChoiceType } {
  return q.type === 'multiple' || q.type === 'boolean';
}

/** Whether a question earns points (and counts toward accuracy and streaks). */
export function isGraded(q: { type: QuestionType }): boolean {
  return q.type !== 'open';
}
