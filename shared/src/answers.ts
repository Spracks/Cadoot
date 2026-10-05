import { MAX_OPEN_ANSWER, MAX_TEXT_ANSWER, type Question } from './quiz';
import type { AnswerPayload, QuestionOutcome, ResponseTally } from './events';

/** Most distinct typed responses a reveal or report lists. */
export const MAX_TALLY = 50;

/**
 * Wrapping quotes and trailing sentence punctuation, which don't change what
 * an answer means. Leading punctuation is kept: in "!=" or "-5" it matters.
 */
const EDGE_PUNCT = /^['"“”‘’]+|['"“”‘’.,;:!?]+$/g;

/**
 * The form typed answers are compared in: case-folded, whitespace collapsed,
 * and wrapping quotes / trailing punctuation dropped, so "Paris", " paris."
 * and "PARIS!" all match. Punctuation inside the answer ("C++", "3.14") is
 * kept. An answer that is nothing *but* punctuation ("?") keeps it, or it
 * would match a blank.
 */
export function normalizeAnswer(text: string): string {
  const collapsed = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return collapsed.replace(EDGE_PUNCT, '').trim() || collapsed;
}

/** Whether a typed answer matches any of a fill-in-the-blank's accepted answers. */
export function matchesAccepted(text: string, accepted: string[]): boolean {
  const given = normalizeAnswer(text);
  return accepted.some((a) => normalizeAnswer(a) === given);
}

/**
 * A random order for a puzzle's right-hand items in which none starts beside
 * its partner, so an untouched puzzle scores nothing. `result[j]` is the pair
 * index of the item shown in slot j.
 */
export function puzzleShuffle(n: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return order;
  // Shuffle until nothing is in place; about e (≈2.7) tries on average.
  for (;;) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    if (order.every((v, i) => v !== i)) return order;
  }
}

/**
 * Validate an answer from a player's device against the question it's for,
 * and put it in the form the server keeps. Returns null for anything malformed
 * — the payload comes off the network, so nothing about it is trusted.
 *
 * A puzzle `order` arrives in terms of the shuffled items the player saw and is
 * translated through `shuffle` into pair indices, so everything downstream can
 * ignore the shuffle: a perfect answer is [0, 1, 2, …].
 */
export function acceptAnswer(
  q: Question,
  raw: unknown,
  shuffle: number[] | null,
): AnswerPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  switch (q.type) {
    case 'multiple':
    case 'boolean': {
      const i = a.optionIndex;
      return Number.isInteger(i) && (i as number) >= 0 && (i as number) < q.options.length
        ? { optionIndex: i as number }
        : null;
    }
    case 'fill':
    case 'open': {
      if (typeof a.text !== 'string') return null;
      const max = q.type === 'open' ? MAX_OPEN_ANSWER : MAX_TEXT_ANSWER;
      const text = a.text.trim().slice(0, max);
      return text ? { text } : null;
    }
    case 'puzzle': {
      const n = q.pairs.length;
      const order = a.order;
      if (!shuffle || shuffle.length !== n || !Array.isArray(order) || order.length !== n) {
        return null;
      }
      const isPermutation =
        order.every((v) => Number.isInteger(v) && v >= 0 && v < n) &&
        new Set(order).size === n;
      if (!isPermutation) return null;
      return { order: order.map((slot: number) => shuffle[slot]!) };
    }
  }
}

/**
 * How much of an accepted answer is right, from 0 to 1. Only puzzles give
 * partial credit (the share of pairs matched); open-ended questions are never
 * graded and always return 0.
 */
export function gradeAnswer(q: Question, answer: AnswerPayload): number {
  switch (q.type) {
    case 'multiple':
    case 'boolean':
      return 'optionIndex' in answer && answer.optionIndex === q.correctIndex ? 1 : 0;
    case 'fill':
      return 'text' in answer && matchesAccepted(answer.text, q.answers) ? 1 : 0;
    case 'open':
      return 0;
    case 'puzzle':
      if (!('order' in answer)) return 0;
      return answer.order.filter((p, i) => p === i).length / q.pairs.length;
  }
}

/**
 * Group typed answers that normalize the same, most common first. Each group
 * is labelled with the first spelling seen. Fill-in-the-blank groups are
 * marked correct or not when `accepted` is given.
 */
export function tallyResponses(texts: string[], accepted?: string[]): ResponseTally[] {
  const groups = new Map<string, ResponseTally>();
  for (const text of texts) {
    const key = normalizeAnswer(text);
    const group = groups.get(key);
    if (group) group.count++;
    else {
      groups.set(key, {
        text,
        count: 1,
        ...(accepted ? { correct: matchesAccepted(text, accepted) } : {}),
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, MAX_TALLY);
}

/**
 * The answer key plus how the class answered, from every player's accepted
 * answer (null where they didn't answer).
 */
export function buildOutcome(
  q: Question,
  given: Array<AnswerPayload | null>,
): QuestionOutcome {
  switch (q.type) {
    case 'multiple':
    case 'boolean': {
      const distribution = new Array<number>(q.options.length).fill(0);
      for (const a of given) {
        if (a && 'optionIndex' in a && a.optionIndex < distribution.length) {
          distribution[a.optionIndex]!++;
        }
      }
      return {
        type: q.type,
        options: q.options,
        correctIndex: q.correctIndex,
        distribution,
      };
    }
    case 'fill':
      return {
        type: 'fill',
        answers: q.answers,
        responses: tallyResponses(typedTexts(given), q.answers),
      };
    case 'open':
      return { type: 'open', responses: tallyResponses(typedTexts(given)) };
    case 'puzzle': {
      const pairCorrect = new Array<number>(q.pairs.length).fill(0);
      for (const a of given) {
        if (!a || !('order' in a)) continue;
        a.order.forEach((p, i) => {
          if (p === i) pairCorrect[i]!++;
        });
      }
      return { type: 'puzzle', pairs: q.pairs, pairCorrect };
    }
  }
}

function typedTexts(given: Array<AnswerPayload | null>): string[] {
  return given.flatMap((a) => (a && 'text' in a ? [a.text] : []));
}
