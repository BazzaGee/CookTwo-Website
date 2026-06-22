import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { GeneratedMeal } from '../types/meal';

const CACHE_PREFIX = 'cooktwo_meal_img_';
const MAX_CACHE = 10;

function sanitizeKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().slice(0, 64);
}

function getCacheKey(householdId: string, mealName: string): string {
  return `${CACHE_PREFIX}${householdId}_${sanitizeKey(mealName)}`;
}

function loadCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}index`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(index: Record<string, string>) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}index`, JSON.stringify(index));
  } catch {
    // quota exceeded or disabled
  }
}

function getCached(householdId: string, mealName: string): string | null {
  try {
    const cache = loadCache();
    const key = getCacheKey(householdId, mealName);
    return cache[key] ?? null;
  } catch {
    return null;
  }
}

function setCached(householdId: string, mealName: string, url: string) {
  try {
    const cache = loadCache();
    const key = getCacheKey(householdId, mealName);
    cache[key] = url;

    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE) {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      for (let i = 0; i < entries.length - MAX_CACHE; i++) {
        delete cache[entries[i]![0]];
      }
    }

    saveCache(cache);
  } catch {
    // ignore
  }
}

export function cacheMealImage(householdId: string, mealName: string, url: string): void {
  setCached(householdId, mealName, url);
}

export interface ImageState {
  url: string | null;
  generating: boolean;
  error: string | null;
}

export function useMealImage(mealName: string) {
  const session = useAuthStore(s => s.session);
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';

  const [state, setState] = useState<ImageState>(() => ({
    url: householdId ? getCached(householdId, mealName) : null,
    generating: false,
    error: null,
  }));

  useEffect(() => {
    if (householdId) {
      const cached = getCached(householdId, mealName);
      setState(prev => prev.url === cached ? prev : { ...prev, url: cached });
    }
  }, [householdId, mealName]);

  const generate = useCallback(async (meal: GeneratedMeal) => {
    if (!householdId || !token) {
      setState(prev => ({ ...prev, error: 'Not authenticated' }));
      return;
    }

    setState(prev => ({ ...prev, generating: true, error: null }));

    try {
      const result = await apiFetch<{ url: string }>(
        `/api/household/${householdId}/meal-image`,
        { method: 'POST', body: meal, token },
      );

      if (result.url) {
        setCached(householdId, mealName, result.url);
        setState({ url: result.url, generating: false, error: null });
      } else {
        setState(prev => ({ ...prev, generating: false, error: 'No image returned' }));
      }
    } catch (err) {
      setState({
        url: null,
        generating: false,
        error: err instanceof Error ? err.message : 'Failed to generate image',
      });
    }
  }, [householdId, token, mealName]);

  return {
    ...state,
    generate,
  };
}
