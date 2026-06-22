import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export type ActivityTargetKind =
  | 'grocery_item'
  | 'pantry_item'
  | 'meal'
  | 'recipe'
  | 'profile'
  | 'household';

export interface ActivityEntry {
  id: string;
  householdId: string;
  partnerId: string | null;
  partnerSlot: 1 | 2 | null;
  partnerName: string | null;
  actionType: string;
  targetKind: ActivityTargetKind;
  targetId: string | null;
  targetName: string | null;
  payload: string | null;
  createdAt: number;
}

const QUERY_KEY = (householdId: string) => ['activity', householdId] as const;

export function useActivityLog(limit = 50) {
  const session = useAuthStore((s) => s.session);
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';

  const { data: entries = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY(householdId),
    queryFn: () =>
      apiFetch<ActivityEntry[]>(
        `/api/household/${householdId}/activity?limit=${limit}`,
        { token },
      ),
    enabled: Boolean(householdId && token),
    staleTime: 15_000,
  });

  return { entries, isLoading, isFetching, error, refetch };
}
