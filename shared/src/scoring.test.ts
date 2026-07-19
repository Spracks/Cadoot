import { describe, it, expect } from 'vitest';
import {
  computeScore,
  streakBonus,
  DEFAULT_SCORE_CONFIG,
  STREAK_STEP,
  MAX_STREAK_LEVEL,
} from './scoring';

describe('computeScore', () => {
  it('awards nothing for a wrong answer', () => {
    expect(computeScore(false, 0, 20000)).toBe(0);
    expect(computeScore(false, 20000, 20000)).toBe(0);
  });

  it('awards full points for an instant correct answer', () => {
    expect(computeScore(true, 0, 20000)).toBe(1000);
  });

  it('awards half points for an answer at the buzzer', () => {
    expect(computeScore(true, 20000, 20000)).toBe(500);
  });

  it('scales linearly between instant and buzzer', () => {
    expect(computeScore(true, 10000, 20000)).toBe(750);
  });

  it('clamps time used to the time limit (no negative or over-100%)', () => {
    expect(computeScore(true, 999999, 20000)).toBe(500);
    expect(computeScore(true, -5000, 20000)).toBe(1000);
  });

  it('ignores speed bonus when disabled', () => {
    const cfg = { ...DEFAULT_SCORE_CONFIG, speedBonus: false };
    expect(computeScore(true, 19000, 20000, cfg)).toBe(1000);
  });
});

describe('streakBonus', () => {
  it('awards nothing for the first correct answer (or none)', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(1)).toBe(0);
  });

  it('grows by one step per consecutive correct answer', () => {
    expect(streakBonus(2)).toBe(STREAK_STEP);
    expect(streakBonus(3)).toBe(STREAK_STEP * 2);
  });

  it('caps at MAX_STREAK_LEVEL', () => {
    const cap = STREAK_STEP * MAX_STREAK_LEVEL;
    expect(streakBonus(MAX_STREAK_LEVEL + 1)).toBe(cap);
    expect(streakBonus(50)).toBe(cap);
  });
});
