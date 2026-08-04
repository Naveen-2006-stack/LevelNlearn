import { QuestionOption } from '../types/index.js';

export interface ScoreResult {
  isCorrect: boolean;
  pointsAwarded: number;
  streakBonus: number;
}

/**
 * Server-side scoring:
 * - pointsAwarded = basePoints if correct, 0 if wrong
 * - streakBonus = currentStreak * 50 if correct, 0 if wrong
 * - currentStreak is participant's streak BEFORE this answer
 */
export function computeScore(
  selectedTexts: string[],
  options: QuestionOption[],
  basePoints: number,
  currentStreak: number,
  questionType: string = 'mcq',
): ScoreResult {
  const normalize = (s: string) => s.trim().toLowerCase();
  const correctOptions = options.filter((o) => o.is_correct).map((o) => normalize(o.text));
  const correctSet = new Set(correctOptions);
  const selected = selectedTexts.map((t) => normalize(t)).filter(Boolean);
  const selectedSet = new Set(selected);

  if (questionType === 'multi_select') {
    const totalCorrect = correctOptions.length || 1;
    let selectedCorrect = 0;
    let selectedIncorrect = 0;
    for (const s of selected) {
      if (correctSet.has(s)) selectedCorrect++; else selectedIncorrect++;
    }
    // Score: proportional to correct selections, penalize incorrect picks at 50% weight
    const raw = (selectedCorrect - 0.5 * selectedIncorrect) / totalCorrect;
    const ratio = Math.max(0, Math.min(1, raw));
    const pointsAwarded = Math.round(basePoints * ratio);
    const isCorrect = selectedCorrect === totalCorrect && selectedIncorrect === 0 && selectedCorrect > 0;
    return { isCorrect, pointsAwarded, streakBonus: isCorrect ? currentStreak * 50 : 0 };
  }

  // default: single correct (mcq / true_false)
  const isCorrect = selectedSet.size > 0 && selectedSet.size === correctSet.size && [...selectedSet].every((t) => correctSet.has(t));
  return { isCorrect, pointsAwarded: isCorrect ? basePoints : 0, streakBonus: isCorrect ? currentStreak * 50 : 0 };
}
