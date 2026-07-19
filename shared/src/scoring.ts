export interface ScoreConfig {
  /** Points awarded for a correct answer given instantly. */
  basePoints: number;
  /** When true, faster correct answers earn more (down to half of basePoints). */
  speedBonus: boolean;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  basePoints: 1000,
  speedBonus: true,
};

/** Extra points added per streak level (2nd correct in a row = one level). */
export const STREAK_STEP = 100;
/** Streak bonus stops growing past this many levels (caps at STREAK_STEP × cap). */
export const MAX_STREAK_LEVEL = 5;

/**
 * Kahoot-style scoring. Wrong answers earn nothing. Correct answers earn
 * `basePoints` scaled linearly by how quickly they were submitted: an instant
 * answer earns the full amount, an answer at the buzzer earns half.
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
  const fraction = Math.min(1, Math.max(0, timeUsedMs / timeLimitMs));
  return Math.round(config.basePoints * (1 - fraction / 2));
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
