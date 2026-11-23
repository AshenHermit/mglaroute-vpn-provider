import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';

interface User {
  id: string;
  username: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isFirstRun: boolean | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  checkFirstRun: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isFirstRun: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      login: async (username: string, password: string) => {
        const result = await api.post<{ token: string; user: User }>('/api/auth/login', { username, password });
        set({ token: result.token, user: result.user });
      },
      setup: async (username: string, password: string) => {
        const result = await api.post<{ token: string; user: User }>('/api/auth/setup', { username, password });
        set({ token: result.token, user: result.user, isFirstRun: false });
      },
      checkFirstRun: async () => {
        try {
          const result = await api.get<{ isFirstRun: boolean }>('/api/auth/first-run');
          set({ isFirstRun: result.isFirstRun });
        } catch {
          set({ isFirstRun: true });
        }
      },
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);