import { useEffect } from 'react';
import { pusherClient } from '../lib/pusherClient';
import { useGameStore, type SessionStatus } from '../store/useGameStore';
import { normalizeSessionStatus } from '../lib/sessionStatus';

type ParticipantPayload = {
  id: string;
  display_name: string;
  score: number;
  streak: number;
  cheat_flags: number;
  last_active?: string;
  is_banned?: boolean;
};

export function useLiveSession(sessionId: string, _role: 'teacher' | 'student') {
  const { setCurrentQuestionIndex, setSessionStatus, updateParticipant, removeParticipant } = useGameStore();

  useEffect(() => {
    if (!sessionId) return;

    const channel = pusherClient.subscribe(`session-${sessionId}`);

    channel.bind('session-update', (data: { current_question_index?: number; status?: SessionStatus }) => {
      if (data.current_question_index !== undefined) setCurrentQuestionIndex(data.current_question_index);
      if (data.status) setSessionStatus(normalizeSessionStatus(data.status));
    });

    channel.bind('participant-join', (data: ParticipantPayload) => updateParticipant(data));

    channel.bind('participant-update', (data: ParticipantPayload) => {
      if (data.is_banned === true) removeParticipant(data.id);
      else updateParticipant(data);
    });

    channel.bind('participant-leave', (data: { id: string }) => removeParticipant(data.id));

    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe(`session-${sessionId}`);
    };
  }, [sessionId, setCurrentQuestionIndex, setSessionStatus, updateParticipant, removeParticipant]);
}
