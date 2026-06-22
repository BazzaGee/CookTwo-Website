import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../../stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    localStorage.clear();
  });

  const mockSession = {
    token: 'test-token',
    householdId: 'hh-1',
    inviteCode: '123456',
    partner: { id: 'p-1', slot: 1 as const, displayName: 'Alex' },
  };

  it('is null by default', () => {
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('persists session to localStorage', () => {
    useAuthStore.getState().setSession(mockSession);
    const saved = JSON.parse(localStorage.getItem('cfs.auth') || '{}');
    expect(saved.state.session).toBeDefined();
    expect(saved.state.session.token).toBe('test-token');
  });

  it('clears session state', () => {
    useAuthStore.getState().setSession(mockSession);
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().hasCompletedOnboarding).toBe(false);
  });

  it('allows updating session', () => {
    useAuthStore.getState().setSession(mockSession);
    const updated = { ...mockSession, token: 'new-token' };
    useAuthStore.getState().setSession(updated);
    expect(useAuthStore.getState().session?.token).toBe('new-token');
  });

  it('tracks onboarding completion', () => {
    expect(useAuthStore.getState().hasCompletedOnboarding).toBe(false);
    useAuthStore.getState().completeOnboarding();
    expect(useAuthStore.getState().hasCompletedOnboarding).toBe(true);
  });
});
