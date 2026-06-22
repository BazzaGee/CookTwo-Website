import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export interface UsageState {
  tier: 'free' | 'premium';
  usedToday: number;
  dailyQuota: number;
  imagesUsedToday: number;
  dailyImageQuota: number;
  remaining: number;
  imagesRemaining: number;
  resetsAt: string;
  planPeriod: 'monthly' | 'yearly' | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

const USAGE_QUERY_KEY = (householdId: string) => ['usage', householdId] as const;

export function useUsage() {
  const session = useAuthStore((s) => s.session);
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';

  const query = useQuery({
    queryKey: USAGE_QUERY_KEY(householdId),
    queryFn: () =>
      apiFetch<UsageState>(`/api/household/${householdId}/usage`, { token }),
    enabled: Boolean(householdId && token),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const usage = query.data;

  return {
    usage,
    isLoading: query.isLoading,
    isPremium: usage?.tier === 'premium',
    remaining: usage?.remaining ?? 0,
    imagesRemaining: usage?.imagesRemaining ?? 0,
    isAtLimit: (usage?.remaining ?? 0) <= 0,
    isNearLimit: (usage?.remaining ?? 0) <= Math.ceil((usage?.dailyQuota ?? 10) * 0.2),
    isImageAtLimit: (usage?.imagesRemaining ?? 0) <= 0,
  };
}
