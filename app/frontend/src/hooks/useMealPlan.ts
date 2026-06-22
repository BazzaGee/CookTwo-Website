import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { GeneratedMeal } from '../types/meal';

export function useMealPlan() {
  const session = useAuthStore((s) => s.session);
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';

  const [meal, setMeal] = useState<GeneratedMeal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateMeal() {
    if (!householdId || !token) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await apiFetch<GeneratedMeal>(
        `/api/household/${householdId}/meal-plan/generate`,
        { method: 'POST', token },
      );
      setMeal(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate meal');
    } finally {
      setIsGenerating(false);
    }
  }

  function clearMeal() {
    setMeal(null);
    setError(null);
  }

  return {
    meal,
    isGenerating,
    error,
    generateMeal,
    clearMeal,
  };
}
