import Papa from 'papaparse';
import { QuizSchema, type Quiz, type QuestionType } from './quiz';
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

const TYPE_ALIASES: Record<string, QuestionType> = {
  multiple: 'multiple',
  mc: 'multiple',
  boolean: 'boolean',
  tf: 'boolean',
  truefalse: 'boolean',
  'true/false': 'boolean',
  'true-false': 'boolean',
  fill: 'fill',
  blank: 'fill',
  fillblank: 'fill',
  'fill-in': 'fill',
  'fill-in-the-blank': 'fill',
  open: 'open',
  openended: 'open',
  'open-ended': 'open',
  puzzle: 'puzzle',
  match: 'puzzle',
  matching: 'puzzle',
};

/** Spreadsheet columns that can hold options, answers or puzzle pairs. */
const OPTION_COLUMNS = ['option1', 'option2', 'option3', 'option4', 'option5', 'option6'];

/**
 * Parse and validate a quiz from CSV text.
 *
 * Expected columns (header row required):
 *   question, type, option1 … option6, correct, timeLimitSec
 *
 * - `type` is optional; blank means multiple choice. See TYPE_ALIASES.
 * - `correct` is 1-based (the human-friendly option number, 1-4), or
 *   true/false for a true/false question. Other types ignore it.
 * - Fill-in-the-blank: every filled option cell is an accepted answer.
 * - Puzzle: each filled option cell is one `left | right` pair.
 * - Options past option2, `type` and `timeLimitSec` are optional.
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

    const typeRaw = (row.type ?? '').trim().toLowerCase();
    const type: QuestionType = TYPE_ALIASES[typeRaw] ?? 'multiple';
    if (typeRaw && !TYPE_ALIASES[typeRaw]) {
      errors.push(`Row ${rowNum}: unknown question type "${row.type}"`);
    }

    const options = OPTION_COLUMNS.map((c) => (row[c] ?? '').trim()).filter(
      (o) => o.length > 0,
    );

    if (type === 'boolean') {
      const c = (row.correct ?? '').trim().toLowerCase();
      let correct: boolean | undefined;
      if (['true', 't', 'yes', 'y', '1'].includes(c)) correct = true;
      else if (['false', 'f', 'no', 'n', '2'].includes(c)) correct = false;
      else errors.push(`Row ${rowNum}: for a true/false question, "correct" must be true or false`);
      return { type: 'boolean', text, correct, timeLimitSec };
    }

    if (type === 'fill') return { type, text, answers: options, timeLimitSec };
    if (type === 'open') return { type, text, timeLimitSec };
    if (type === 'puzzle') {
      const pairs = options.map((cell) => {
        const bar = cell.indexOf('|');
        if (bar === -1) {
          errors.push(`Row ${rowNum}: puzzle pairs are written "item | match" — "${cell}" has no "|"`);
          return { left: cell, right: '' };
        }
        return { left: cell.slice(0, bar).trim(), right: cell.slice(bar + 1).trim() };
      });
      return { type, text, pairs, timeLimitSec };
    }

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
