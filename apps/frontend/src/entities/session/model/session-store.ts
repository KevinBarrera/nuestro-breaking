import { create } from 'zustand';
import type { UserSession } from './types';

type SessionState = {
  session: UserSession;
  setSession: (session: UserSession) => void;
  clearSession: () => void;
};

const emptySession: UserSession = { user: null };

export const useSessionStore = create<SessionState>((set) => ({
  session: emptySession,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: emptySession }),
}));
