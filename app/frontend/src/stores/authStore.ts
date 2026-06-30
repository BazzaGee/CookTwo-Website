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
  devSkipOnboarding: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      // Synchronous dev-skip check on first store access.
      // If the localStorage flag is set, immediately return a dev session
      // so the Gate component allows access on the very first render.
      if (typeof window !== 'undefined') {
        try {
          if (localStorage.getItem('cfs.dev_skip_applied') === '1') {
            return {
              session: {
                token: 'dev-skip-token',
                householdId: 'dev-household',
                inviteCode: '000000',
                partner: { id: 'dev-partner-a', slot: 1, displayName: 'Partner A' },
              },
              hasCompletedOnboarding: true,
              setSession: (session: AuthSession) => set({ session }),
              completeOnboarding: () => set({ hasCompletedOnboarding: true }),
              clear: () => set({ session: null, hasCompletedOnboarding: false }),
              devSkipOnboarding: () =>
                set({
                  session: {
                    token: 'dev-skip-token',
                    householdId: 'dev-household',
                    inviteCode: '000000',
                    partner: { id: 'dev-partner-a', slot: 1, displayName: 'Partner A' },
                  },
                  hasCompletedOnboarding: true,
                }),
            };
          }
        } catch {}
      }
      return {
        session: null,
        hasCompletedOnboarding: false,
        setSession: (session: AuthSession) => set({ session }),
        completeOnboarding: () => set({ hasCompletedOnboarding: true }),
        clear: () => set({ session: null, hasCompletedOnboarding: false }),
        devSkipOnboarding: () =>
          set({
            session: {
              token: 'dev-skip-token',
              householdId: 'dev-household',
              inviteCode: '000000',
              partner: { id: 'dev-partner-a', slot: 1, displayName: 'Partner A' },
            },
            hasCompletedOnboarding: true,
          }),
      };
    },
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
