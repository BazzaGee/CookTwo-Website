import { apiFetch } from '../lib/api';
import { useAuthStore, type AuthSession } from '../stores/authStore';

export interface CreateHouseholdInput {
  displayName: string;
  diet?: string;
  allergies?: string;
  allergens?: string[];
  goal?: string;
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  gender?: string | null;
  activityLevel?: string | null;
}

export interface JoinHouseholdInput {
  inviteCode: string;
  displayName: string;
  diet?: string;
  allergies?: string;
  allergens?: string[];
  goal?: string;
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  gender?: string | null;
  activityLevel?: string | null;
}

export type CreateOrJoinResult = AuthSession;

export async function createHousehold(input: CreateHouseholdInput): Promise<CreateOrJoinResult> {
  const res = await apiFetch<{
    householdId: string;
    inviteCode: string;
    token: string;
    partner: { id: string; slot: 1 | 2; displayName: string };
  }>('/api/household/create', {
    method: 'POST',
    body: input,
  });
  return {
    token: res.token,
    householdId: res.householdId,
    inviteCode: res.inviteCode,
    partner: res.partner,
  };
}

export async function joinHousehold(input: JoinHouseholdInput): Promise<CreateOrJoinResult> {
  const res = await apiFetch<{
    householdId: string;
    token: string;
    partner: { id: string; slot: 1 | 2; displayName: string };
  }>('/api/household/join', {
    method: 'POST',
    body: input,
  });
  return {
    token: res.token,
    householdId: res.householdId,
    partner: res.partner,
  };
}

export async function linkWithPartner(inviteCode: string, token: string): Promise<CreateOrJoinResult> {
  const res = await apiFetch<{
    householdId: string;
    token: string;
    partner: { id: string; slot: 1 | 2; displayName: string };
  }>('/api/household/link', {
    method: 'POST',
    body: { inviteCode },
    token,
  });
  return {
    token: res.token,
    householdId: res.householdId,
    partner: res.partner,
  };
}

export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  return {
    session,
    isAuthed: session !== null,
    setSession,
    clear,
  };
}
