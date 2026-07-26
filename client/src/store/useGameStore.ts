import { create } from 'zustand';

export type SessionStatus = 'waiting' | 'active' | 'finished';

interface Participant {
  id: string;
  display_name: string;
  regNo?: string | null;
  score: number;
  streak: number;
  cheat_flags: number;
  last_active?: string;
}

interface GameState {
  sessionStatus: SessionStatus;
  currentQuestionIndex: number;
  participants: Record<string, Participant>;

  setSessionStatus: (status: SessionStatus) => void;
  setCurrentQuestionIndex: (index: number) => void;
  updateParticipant: (participant: Participant) => void;
  setParticipants: (participants: Participant[]) => void;
  removeParticipant: (id: string) => void;
  incrementCheatFlag: (participantId: string) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  sessionStatus: 'waiting',
  currentQuestionIndex: 0,
  participants: {},

  setSessionStatus: (status) => set({ sessionStatus: status }),

  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),

  updateParticipant: (participant) => set((state) => {
    const prev = state.participants[participant.id];
    return {
      participants: {
        ...state.participants,
        [participant.id]: {
          ...participant,
          cheat_flags: Math.max(participant.cheat_flags || 0, prev?.cheat_flags || 0),
        },
      },
    };
  }),

  setParticipants: (list) => set((state) => {
    const map: Record<string, Participant> = {};
    list.forEach((p) => {
      const prev = state.participants[p.id];
      map[p.id] = { ...p, cheat_flags: Math.max(p.cheat_flags || 0, prev?.cheat_flags || 0) };
    });
    return { participants: map };
  }),

  removeParticipant: (id) => set((state) => {
    const next = { ...state.participants };
    delete next[id];
    return { participants: next };
  }),

  incrementCheatFlag: (id) => set((state) => {
    const p = state.participants[id];
    if (!p) return state;
    return {
      participants: {
        ...state.participants,
        [id]: { ...p, cheat_flags: (p.cheat_flags || 0) + 1 },
      },
    };
  }),

  reset: () => set({ sessionStatus: 'waiting', currentQuestionIndex: 0, participants: {} }),
}));
