export const LIVE_QUIZ_SESSION_KEY = 'levelnlearn_live_quiz_session';

export interface PersistedLiveQuizSession {
  participantId?: string;
  sessionId?: string;
  gamePin?: string;
  nickname?: string;
}

export function getPersistedLiveQuizSession(expectedSessionId?: string): PersistedLiveQuizSession | null {
  const raw = sessionStorage.getItem(LIVE_QUIZ_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedLiveQuizSession;
    if (!parsed?.participantId || !parsed?.sessionId) return null;
    if (expectedSessionId && parsed.sessionId !== expectedSessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPersistedLiveQuizSession(session: PersistedLiveQuizSession): void {
  sessionStorage.setItem(LIVE_QUIZ_SESSION_KEY, JSON.stringify(session));
}

export function clearPersistedLiveQuizSession(): void {
  sessionStorage.removeItem(LIVE_QUIZ_SESSION_KEY);
}
