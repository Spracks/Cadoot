import Papa from 'papaparse';
import { QuizSchema, type Quiz } from './quiz';
import { z } from 'zod';

export type ParseResult =
  | { ok: true; quiz: Quiz }
  | { ok: false; errors: string[] };

function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}

/** Parse and validate a quiz from JSON text. */
export function parseQuizJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      errors: [`Invalid JSON: ${(err as Error).message}`],
    };
  }
  const result = QuizSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, errors: formatZodErrors(result.error) };
  }
  return { ok: true, quiz: result.data };
}

/**
 * Parse and validate a quiz from CSV text.
 *
 * Expected columns (header row required):
 *   question, option1, option2, option3, option4, correct, timeLimitSec
 *
 * - `correct` is 1-based (the human-friendly option number, 1-4).
 * - option3/option4 and timeLimitSec are optional.
 * - The quiz title defaults to `titleFallback` (typically the file name).
 */
export function parseQuizCsv(
  text: string,
  titleFallback = 'Imported Quiz',
): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    return {
      ok: false,
      errors: parsed.errors.map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`),
    };
  }

  const errors: string[] = [];
  const questions = parsed.data.map((row, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based display
    const text = (row.question ?? '').trim();

    const timeRaw = (row.timelimitsec ?? '').trim();
    const timeLimitSec = timeRaw ? Number(timeRaw) : 20;

    // Optional "type" column: boolean / tf / true-false makes a True/False question.
    const typeRaw = (row.type ?? '').trim().toLowerCase();
    const isBoolean = ['boolean', 'tf', 'truefalse', 'true/false', 'true-false'].includes(typeRaw);

    if (isBoolean) {
      const c = (row.correct ?? '').trim().toLowerCase();
      let correct: boolean | undefined;
      if (['true', 't', 'yes', 'y', '1'].includes(c)) correct = true;
      else if (['false', 'f', 'no', 'n', '2'].includes(c)) correct = false;
      else errors.push(`Row ${rowNum}: for a true/false question, "correct" must be true or false`);
      return { type: 'boolean', text, correct, timeLimitSec };
    }

    const options = [row.option1, row.option2, row.option3, row.option4]
      .map((o) => (o ?? '').trim())
      .filter((o) => o.length > 0);

    const correctRaw = (row.correct ?? '').trim();
    const correct1Based = Number(correctRaw);
    if (!correctRaw || Number.isNaN(correct1Based)) {
      errors.push(`Row ${rowNum}: "correct" must be an option number (1-${options.length || 4})`);
    }

    return {
      text,
      options,
      correctIndex: correct1Based - 1,
      timeLimitSec,
    };
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = QuizSchema.safeParse({ title: titleFallback, questions });
  if (!result.success) {
    return { ok: false, errors: formatZodErrors(result.error) };
  }
  return { ok: true, quiz: result.data };
}

/** Pick the right parser based on a file name / extension. */
export function parseQuizByFilename(
  filename: string,
  text: string,
): ParseResult {
  const lower = filename.toLowerCase();
  const baseTitle = filename.replace(/\.[^.]+$/, '');
  if (lower.endsWith('.csv')) return parseQuizCsv(text, baseTitle);
  if (lower.endsWith('.json')) return parseQuizJson(text);
  return {
    ok: false,
    errors: [`Unsupported file type: ${filename} (expected .json or .csv)`],
  };
}
