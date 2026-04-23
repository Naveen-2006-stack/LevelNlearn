"use client";
import { useEffect } from 'react';
import { pusherClient } from '@/lib/pusherClient';
import { useGameStore, type SessionStatus } from '@/store/useGameStore';

type ParticipantPayload = {
  id: string;
  display_name: string;
  score: number;
  streak: number;
  cheat_flags: number;
  last_active?: string;
  is_banned?: boolean;
};

/**
 * useLiveSession — single hook that wires up ALL Pusher Realtime subscriptions
 * for a given quiz session. Combines session state + participant changes into one
 * managed lifecycle, with guaranteed cleanup on unmount.
 */
export function useLiveSession(sessionId: string, role: 'teacher' | 'student') {
  const {
    setCurrentQuestionIndex,
    setSessionStatus,
    updateParticipant,
    removeParticipant,
  } = useGameStore();

  useEffect(() => {
    if (!sessionId) return;

    // We use a single pusher channel for the entire session
    const channel = pusherClient.subscribe(`session-${sessionId}`);

    // --- Game State Events ---
    channel.bind('session-update', (data: { current_question_index?: number; status?: SessionStatus }) => {
      if (data.current_question_index !== undefined) {
        setCurrentQuestionIndex(data.current_question_index);
      }
      if (data.status) {
        setSessionStatus(data.status);
      }
    });

    // --- Participant Events ---
    channel.bind('participant-join', (data: ParticipantPayload) => {
      updateParticipant(data);
    });

    channel.bind('participant-update', (data: ParticipantPayload) => {
      if (data.is_banned === true) {
        removeParticipant(data.id);
      } else {
        updateParticipant(data);
      }
    });

    channel.bind('participant-leave', (data: { id: string }) => {
      removeParticipant(data.id);
    });

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[Realtime] channel for ${sessionId} is live`);
    });

    // Cleanup: unsubscribe from channel on unmount
    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe(`session-${sessionId}`);
    };
  }, [
    sessionId,
    role,
    setCurrentQuestionIndex,
    setSessionStatus,
    updateParticipant,
    removeParticipant,
  ]);
}
