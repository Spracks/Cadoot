import { QuizSchema, type Quiz, type QuestionType } from '@cadoot/shared';

/** In-progress question as edited in the manual builder (4 fixed option slots). */
export interface DraftQuestion {
  text: string;
  type: QuestionType;
  options: string[];
  /** For 'multiple': index into `options`. For 'boolean': 0 = True, 1 = False. */
  correctIndex: number;
  timeLimitSec: number;
}

export interface Draft {
  title: string;
  questions: DraftQuestion[];
}

export const emptyDraftQuestion = (): DraftQuestion => ({
  text: '',
  type: 'multiple',
  options: ['', '', '', ''],
  correctIndex: 0,
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
    if (!q.text.trim()) problems.push(`Question ${n}: add the question text.`);

    if (q.type === 'boolean') {
      return {
        type: 'boolean' as const,
        text: q.text.trim(),
        options: ['True', 'False'],
        correctIndex: q.correctIndex === 1 ? 1 : 0,
        timeLimitSec: q.timeLimitSec,
      };
    }

    const filled = q.options
      .map((text, idx) => ({ text: text.trim(), idx }))
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
      text: q.text.trim(),
      options: filled.map((o) => o.text),
      correctIndex: Math.max(0, correct),
      timeLimitSec: q.timeLimitSec,
    };
  });

  if (problems.length > 0) return { quiz: null, problems };

  const parsed = QuizSchema.safeParse({ title: draft.title.trim(), questions });
  if (!parsed.success) {
    return { quiz: null, problems: parsed.error.issues.map((iss) => iss.message) };
  }
  return { quiz: parsed.data, problems: [] };
}
