import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PartnerSlot = 1 | 2;

export interface PartnerInfo {
  id: string;
  slot: PartnerSlot;
  displayName: string;
}

export interface AuthSession {
  token: string;
  householdId: string;
  inviteCode?: string;
  partner: PartnerInfo;
}

interface AuthState {
  session: AuthSession | null;
  hasCompletedOnboarding: boolean;
  setSession: (session: AuthSession) => void;
  completeOnboarding: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      hasCompletedOnboarding: false,
      setSession: (session) => set({ session }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      clear: () => set({ session: null, hasCompletedOnboarding: false }),
    }),
    {
      name: 'cfs.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session, hasCompletedOnboarding: state.hasCompletedOnboarding }),
    },
  ),
);

export const selectSession = (state: AuthState) => state.session;
export const selectIsAuthed = (state: AuthState) => state.session !== null;
export const selectPartner = (state: AuthState) => state.session?.partner ?? null;
export const selectHouseholdId = (state: AuthState) => state.session?.householdId ?? null;
export const selectToken = (state: AuthState) => state.session?.token ?? null;
