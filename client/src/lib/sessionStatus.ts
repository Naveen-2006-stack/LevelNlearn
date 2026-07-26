import type { SessionStatus } from '../store/useGameStore';

export function normalizeSessionStatus(input: unknown, fallback: SessionStatus = 'waiting'): SessionStatus {
  if (typeof input !== 'string') return fallback;
  const normalized = input.trim().toLowerCase();
  if (normalized === 'waiting' || normalized === 'active' || normalized === 'finished') {
    return normalized;
  }
  return fallback;
}
