import { describe, it, expect } from 'vitest';
import { computeScore } from '../src/services/scoring';

const makeOption = (text: string, is_correct = false) => ({ id: text, text, is_correct });

describe('computeScore', () => {
  it('awards full points for single-correct MCQ', () => {
    const options = [makeOption('A', true), makeOption('B'), makeOption('C')];
    const res = computeScore(['A'], options as any, 100, 2, 'mcq');
    expect(res.isCorrect).toBe(true);
    expect(res.pointsAwarded).toBe(100);
    expect(res.streakBonus).toBe(100);
  });

  it('awards zero for incorrect MCQ', () => {
    const options = [makeOption('A', true), makeOption('B'), makeOption('C')];
    const res = computeScore(['B'], options as any, 100, 1, 'mcq');
    expect(res.isCorrect).toBe(false);
    expect(res.pointsAwarded).toBe(0);
    expect(res.streakBonus).toBe(0);
  });

  it('gives proportional credit for multi_select partial answers', () => {
    const options = [makeOption('A', true), makeOption('B', true), makeOption('C')];
    const res = computeScore(['A'], options as any, 100, 0, 'multi_select');
    // one correct of two => 50 points
    expect(res.pointsAwarded).toBe(50);
    expect(res.isCorrect).toBe(false);
  });

  it('penalizes incorrect picks in multi_select', () => {
    const options = [makeOption('A', true), makeOption('B', true), makeOption('C')];
    const res = computeScore(['A', 'C'], options as any, 100, 0, 'multi_select');
    // selectedCorrect=1, selectedIncorrect=1 -> raw = (1 - 0.5*1)/2 = 0.25 -> 25 points
    expect(res.pointsAwarded).toBe(25);
    expect(res.isCorrect).toBe(false);
  });

  it('awards full points and streak for perfect multi_select', () => {
    const options = [makeOption('A', true), makeOption('B', true), makeOption('C')];
    const res = computeScore(['A', 'B'], options as any, 100, 3, 'multi_select');
    expect(res.pointsAwarded).toBe(100);
    expect(res.isCorrect).toBe(true);
    expect(res.streakBonus).toBe(150);
  });
});
