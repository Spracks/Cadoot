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
