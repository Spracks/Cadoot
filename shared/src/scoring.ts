export interface ScoreConfig {
  /** Points awarded for a correct answer given instantly. */
  basePoints: number;
  /** When true, faster correct answers earn more (down to half of basePoints). */
  speedBonus: boolean;
  /**
   * Reading time at the start of a question during which a correct answer still
   * earns full points. The speed decay only begins after this, so players are
   * not punished for reading the question before answering.
   */
  graceMs: number;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  basePoints: 1000,
  speedBonus: true,
  graceMs: 5000,
};

/** Extra points added per streak level (2nd correct in a row = one level). */
export const STREAK_STEP = 100;
/** Streak bonus stops growing past this many levels (caps at STREAK_STEP × cap). */
export const MAX_STREAK_LEVEL = 5;

/**
 * Kahoot-style scoring. Wrong answers earn nothing. Correct answers earn
 * `basePoints`, reduced by how long the answer took: anything inside the
 * `graceMs` reading window earns the full amount, after which the value decays
 * linearly across the rest of the time limit, reaching half at the buzzer.
 *
 * If the time limit is no longer than the grace window, the whole question is
 * reading time and every correct answer earns full points.
 *
 * Timing is always computed server-side (see server handlers) so clients cannot
 * spoof a faster time.
 */
export function computeScore(
  correct: boolean,
  timeUsedMs: number,
  timeLimitMs: number,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): number {
  if (!correct) return 0;
  if (!config.speedBonus || timeLimitMs <= 0) return config.basePoints;
  const grace = Math.max(0, config.graceMs);
  if (timeUsedMs <= grace) return config.basePoints;
  const decayWindow = timeLimitMs - grace;
  if (decayWindow <= 0) return config.basePoints;
  const fraction = Math.min(1, (timeUsedMs - grace) / decayWindow);
  return Math.round(config.basePoints * (1 - fraction / 2));
}

/**
 * The highest total anyone could hold after `questionsAsked` questions: every
 * answer correct, inside the grace window, on an unbroken streak. The host
 * leaderboard scales its bars against this.
 */
export function maxPossibleScore(
  questionsAsked: number,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): number {
  let total = 0;
  for (let i = 1; i <= questionsAsked; i++) {
    total += config.basePoints + streakBonus(i);
  }
  return total;
}

/**
 * Kahoot-style streak bonus: consecutive correct answers earn escalating extra
 * points. `streak` is the running count of correct answers in a row (1 on the
 * first correct answer). The first correct answer earns no bonus; each further
 * correct answer adds one `STREAK_STEP`, capped at `MAX_STREAK_LEVEL` levels.
 * A wrong answer resets the streak to 0 (handled by the caller).
 */
export function streakBonus(streak: number): number {
  if (streak < 2) return 0;
  const level = Math.min(streak - 1, MAX_STREAK_LEVEL);
  return level * STREAK_STEP;
}
