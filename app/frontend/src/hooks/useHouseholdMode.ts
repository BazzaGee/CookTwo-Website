import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export type HouseholdMode = 'solo' | 'couple' | 'loading';

export function useHouseholdMode(): HouseholdMode {
  const session = useAuthStore((s) => s.session);
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['profiles', householdId],
    queryFn: () =>
      apiFetch<Array<{ slot: number }>>(`/api/household/${householdId}/profiles`, { token }),
    enabled: Boolean(householdId && token),
    staleTime: 60_000,
  });

  if (isLoading) return 'loading';
  if (!data) return 'loading';
  return data.length === 1 ? 'solo' : 'couple';
}
