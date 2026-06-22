import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export type Diet = string;
export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain' | 'none';

export interface TDEEResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
}

export interface PartnerProfile {
  id: string;
  householdId: string;
  slot: 1 | 2;
  name: string;
  diet: Diet;
  fastingMode: string | null;
  allergies: string;
  allergens: string[];
  createdAt: number;
  updatedAt: number;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: Gender | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  tdee: TDEEResult | null;
}

const FALLBACK_PARTNER_NAME = 'Your partner';

export function resolvePartnerName(profiles: PartnerProfile[], slot: 1 | 2): string {
  return profiles.find((p) => p.slot === slot)?.name ?? FALLBACK_PARTNER_NAME;
}

const QUERY_KEY = (householdId: string) => ['profiles', householdId] as const;

export function useProfiles() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';
  const myPartnerId = session?.partner.id ?? '';

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: QUERY_KEY(householdId),
    queryFn: () =>
      apiFetch<PartnerProfile[]>(`/api/household/${householdId}/profiles`, { token }),
    enabled: Boolean(householdId && token),
    staleTime: 60_000,
  });

  const updateProfile = useCallback(
    async (partnerId: string, updates: { name?: string; diet?: string; fastingMode?: string | null; allergies?: string; allergens?: string[]; weightKg?: number | null; heightCm?: number | null; age?: number | null; gender?: string | null; activityLevel?: string | null; goal?: string | null }) => {
      const result = await apiFetch<PartnerProfile>(
        `/api/household/${householdId}/profiles/${partnerId}`,
        {
          method: 'PUT',
          body: updates,
          token,
        },
      );
      queryClient.setQueryData<PartnerProfile[]>(QUERY_KEY(householdId), (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === partnerId ? result : p));
      });
      return result;
    },
    [householdId, token, queryClient],
  );

  const myProfile = profiles.find((p) => p.id === myPartnerId) ?? null;
  const otherProfile = profiles.find((p) => p.id !== myPartnerId) ?? null;

  return {
    profiles,
    isLoading,
    myProfile,
    otherProfile,
    updateProfile,
  };
}
