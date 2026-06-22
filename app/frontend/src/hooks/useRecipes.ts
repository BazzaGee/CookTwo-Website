import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { GeneratedMeal } from '../types/meal';

export interface SavedRecipe {
  id: string;
  householdId: string;
  name: string;
  mealData: string;
  savedAt: number;
  timesCooked: number;
}

const QUERY_KEY = (householdId: string) => ['recipes', householdId] as const;

export function useRecipes() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: QUERY_KEY(householdId),
    queryFn: () =>
      apiFetch<SavedRecipe[]>(`/api/household/${householdId}/recipes`, { token }),
    enabled: Boolean(householdId && token),
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (meal: GeneratedMeal) =>
      apiFetch<SavedRecipe>(`/api/household/${householdId}/recipes`, {
        method: 'POST',
        body: { name: meal.name, mealData: JSON.stringify(meal) },
        token,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(householdId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recipeId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/household/${householdId}/recipes/${recipeId}`, {
        method: 'DELETE',
        token,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(householdId) });
    },
  });

  function getMeal(recipe: SavedRecipe): GeneratedMeal | null {
    try {
      return JSON.parse(recipe.mealData) as GeneratedMeal;
    } catch {
      return null;
    }
  }

  return {
    recipes,
    isLoading,
    hasRecipes: recipes.length > 0,
    saveRecipe: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    deleteRecipe: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    getMeal,
  };
}
