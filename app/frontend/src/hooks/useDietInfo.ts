import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { DietCatalogEntry, DietArticleSummary, DietArticleContent } from '../types/diet';

export function useDietList() {
  return useQuery({
    queryKey: ['diets'],
    queryFn: () => apiFetch<DietCatalogEntry[]>('/api/diets'),
    staleTime: Infinity,
  });
}

export function useDietDetail(dietKey: string | null) {
  return useQuery({
    queryKey: ['diet', dietKey],
    queryFn: () => apiFetch<DietCatalogEntry>(`/api/diets/${dietKey}`),
    enabled: Boolean(dietKey),
    staleTime: Infinity,
  });
}

export function useDietArticles(dietKey: string | null) {
  return useQuery({
    queryKey: ['diet-articles', dietKey],
    queryFn: () => apiFetch<DietArticleSummary[]>(`/api/diets/${dietKey}/articles`),
    enabled: Boolean(dietKey),
    staleTime: Infinity,
  });
}

export function useDietArticle(dietKey: string | null, fileSlug: string | null) {
  return useQuery({
    queryKey: ['diet-article', dietKey, fileSlug],
    queryFn: () => apiFetch<DietArticleContent>(`/api/diets/${dietKey}/articles/${fileSlug}`),
    enabled: Boolean(dietKey && fileSlug),
    staleTime: Infinity,
  });
}
