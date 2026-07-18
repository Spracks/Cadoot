import { z } from 'zod';

export type QuestionType = 'multiple' | 'boolean';

/**
 * The validated, canonical form of a question. Both multiple-choice and
 * true/false questions end up here with explicit `options` + `correctIndex`
 * (a true/false question is just a 2-option question with type 'boolean').
 *
 * NOTE: correctIndex is 0-based in JSON. The CSV importer accepts a 1-based
 * "correct" column; true/false questions also accept a `correct: true|false`
 * shorthand (see the preprocess below and `parse.ts`).
 */
const CanonicalQuestion = z
  .object({
    text: z.string().min(1, 'Question text is required'),
    type: z.enum(['multiple', 'boolean']).default('multiple'),
    options: z
      .array(z.string().min(1, 'Option text cannot be empty'))
      .min(2, 'A question needs at least 2 options')
      .max(4, 'A question can have at most 4 options'),
    correctIndex: z
      .number({ invalid_type_error: 'correctIndex must be a number' })
      .int('correctIndex must be a whole number')
      .nonnegative('correctIndex cannot be negative'),
    timeLimitSec: z
      .number()
      .int('timeLimitSec must be a whole number')
      .positive('timeLimitSec must be greater than 0')
      .max(300, 'timeLimitSec cannot exceed 300')
      .default(20),
    points: z.number().int().positive().optional(),
  })
  .refine((q) => q.correctIndex < q.options.length, {
    message: 'correctIndex points past the last option',
    path: ['correctIndex'],
  })
  .refine((q) => q.type !== 'boolean' || q.options.length === 2, {
    message: 'A true/false question must have exactly 2 options',
    path: ['options'],
  });

/**
 * Public question schema. A preprocess step expands the true/false shorthand
 * (`{ type: 'boolean', correct: true }`) into the canonical options form before
 * validation, so authors don't have to spell out ["True", "False"] by hand.
 */
export const QuestionSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const q = raw as Record<string, unknown>;
    const looksBoolean =
      q.type === 'boolean' ||
      (typeof q.correct === 'boolean' && q.options === undefined);
    if (looksBoolean) {
      const options =
        Array.isArray(q.options) && q.options.length === 2
          ? q.options
          : ['True', 'False'];
      const correctIndex =
        typeof q.correct === 'boolean' ? (q.correct ? 0 : 1) : q.correctIndex;
      return { ...q, type: 'boolean', options, correctIndex };
    }
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
export type Quiz = z.infer<typeof QuizSchema>;
