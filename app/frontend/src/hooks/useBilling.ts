import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export type BillingPlan = 'monthly' | 'yearly';

export function useBilling() {
  const session = useAuthStore((s) => s.session);
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';
  const [checkingOut, setCheckingOut] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [stripeAvailable, setStripeAvailable] = useState<boolean | null>(null);

  async function checkStripeStatus() {
    try {
      const res = await apiFetch<{ configured: boolean }>('/api/billing/status');
      setStripeAvailable(res.configured);
      return res.configured;
    } catch {
      setStripeAvailable(false);
      return false;
    }
  }

  async function checkout(plan: BillingPlan) {
    if (!householdId || !token) return;
    setCheckingOut(true);
    try {
      const res = await apiFetch<{ url: string }>(
        `/api/household/${householdId}/billing/checkout`,
        {
          method: 'POST',
          token,
          body: { plan },
        },
      );
      if (res.url) {
        window.location.href = res.url;
      }
    } catch {
      throw new Error('Stripe not configured');
    } finally {
      setCheckingOut(false);
    }
  }

  async function openPortal() {
    if (!householdId || !token) return;
    setPortalLoading(true);
    try {
      const res = await apiFetch<{ url: string }>(
        `/api/household/${householdId}/billing/portal`,
        {
          method: 'POST',
          token,
        },
      );
      if (res.url) {
        window.location.href = res.url;
      }
    } catch {
      throw new Error('No portal available');
    } finally {
      setPortalLoading(false);
    }
  }

  return {
    checkingOut,
    portalLoading,
    stripeAvailable,
    checkStripeStatus,
    checkout,
    openPortal,
  };
}
