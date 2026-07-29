import { describe, it, expect } from 'vitest';
import {
  computeScore,
  streakBonus,
  maxPossibleScore,
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

  it('awards full points anywhere inside the grace window', () => {
    // The reading buffer: no decay at all for the first graceMs.
    expect(computeScore(true, 1000, 20000)).toBe(1000);
    expect(computeScore(true, 4999, 20000)).toBe(1000);
    expect(computeScore(true, DEFAULT_SCORE_CONFIG.graceMs, 20000)).toBe(1000);
  });

  it('starts decaying only after the grace window', () => {
    // 10s used on a 20s limit is 5s into a 15s decay window => 1/3 of the way
    // from full to half.
    expect(computeScore(true, 10000, 20000)).toBe(833);
    // Just past grace is still worth very nearly full points.
    expect(computeScore(true, 5100, 20000)).toBe(997);
  });

  it('awards full points when the limit is no longer than the grace', () => {
    expect(computeScore(true, 4000, 5000)).toBe(1000);
    expect(computeScore(true, 3000, 3000)).toBe(1000);
  });

  it('honours a custom grace window', () => {
    const cfg = { ...DEFAULT_SCORE_CONFIG, graceMs: 0 };
    expect(computeScore(true, 10000, 20000, cfg)).toBe(750);
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

describe('maxPossibleScore', () => {
  it('is zero before any question has been scored', () => {
    expect(maxPossibleScore(0)).toBe(0);
  });

  it('is base points for the first question (no streak bonus yet)', () => {
    expect(maxPossibleScore(1)).toBe(DEFAULT_SCORE_CONFIG.basePoints);
  });

  it('accumulates base points plus the perfect streak bonus', () => {
    expect(maxPossibleScore(2)).toBe(2100); // 1000 + 1100
    expect(maxPossibleScore(3)).toBe(3300); // + 1200
  });

  it('grows by a fixed amount once the streak bonus caps', () => {
    const capped =
      DEFAULT_SCORE_CONFIG.basePoints + STREAK_STEP * MAX_STREAK_LEVEL;
    expect(maxPossibleScore(7) - maxPossibleScore(6)).toBe(capped);
  });

  it('never scores below what a real player could reach', () => {
    // A perfect run must land exactly on the ceiling, never past it.
    let running = 0;
    for (let q = 1; q <= 8; q++) {
      running += computeScore(true, 0, 20000) + streakBonus(q);
      expect(running).toBe(maxPossibleScore(q));
    }
  });
});
