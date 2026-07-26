import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  regNo?: string | null;
  image?: string | null;
  role: 'TEACHER' | 'STUDENT' | 'ADMIN';
  isGhost?: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token, user) => set({ token, user, isAuthenticated: true }),

      logout: () => set({ token: null, user: null, isAuthenticated: false }),

      updateUser: (patch) => {
        const current = get().user;
        if (current) set({ user: { ...current, ...patch } });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
