import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, getWsBaseUrl } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { cacheMealImage } from './useMealImage';
import type { GeneratedMeal } from '../types/meal';
import type { SyncEvent } from '../types/grocery';

export type MealGenerationMode = 'auto' | 'cook_from_pantry' | 'generate_freely';

export interface ClarificationOption {
  id: MealGenerationMode;
  label: string;
  hint?: string;
}

export interface ChatClarification {
  kind: 'pantry_diet_conflict' | 'empty_pantry' | 'no_safe_items';
  conflictingItems: string[];
  allergenBlocked: boolean;
  options: ClarificationOption[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meal?: GeneratedMeal;
  addedToPantry?: string[];
  addedToList?: string[];
  clarification?: ChatClarification;
  timestamp: number;
}

interface ServerResponse {
  message: string;
  meal?: GeneratedMeal;
  actions?: {
    addToPantry?: string[];
    addToList?: string[];
  };
  clarification?: ChatClarification;
}

const STORAGE_KEY = 'cooktwo_chat_messages';

function loadMessages(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as ChatMessage[];
  } catch { /* ignore */ }
  return [];
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch { /* ignore (e.g. quota) */ }
}

function loadIdCounter(): number {
  try {
    const saved = localStorage.getItem('cooktwo_chat_counter');
    if (saved) return parseInt(saved, 10) || 0;
  } catch { /* ignore */ }
  return 0;
}

function saveIdCounter(n: number) {
  try {
      localStorage.setItem('cooktwo_chat_counter', String(n));
  } catch { /* ignore */ }
}

const PANTRY_QUERY_KEY = ['pantry'] as const;
const GROCERY_QUERY_KEY = ['grocery'] as const;

export function useMealChat() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';
  const partnerId = session?.partner.id ?? '';
  const partnerSlot = session?.partner.slot ?? 1;

  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let idCounter = loadIdCounter();

  function nextId() {
    idCounter += 1;
    saveIdCounter(idCounter);
    return `msg-${idCounter}-${Date.now()}`;
  }

  function invalidateRelated() {
    if (householdId) {
      queryClient.invalidateQueries({ queryKey: [...PANTRY_QUERY_KEY, householdId] });
      queryClient.invalidateQueries({ queryKey: [...GROCERY_QUERY_KEY, householdId] });
    }
  }

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!householdId || !token || !partnerId) return;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const params = new URLSearchParams({
        token,
        partnerId,
        slot: String(partnerSlot),
      });
      const url = `${getWsBaseUrl()}/api/household/${householdId}/ws?${params.toString()}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as SyncEvent;
          if (event.type !== 'meal_generated' && event.type !== 'recipe_added') return;

          if (event.type === 'meal_generated') {
            if (event.generatedByPartnerId === partnerId) return;
            const meal = { ...event.meal, savedRecipeId: event.recipeId } as GeneratedMeal;
            if (event.imageUrl && householdId) {
              cacheMealImage(householdId, event.meal.name, event.imageUrl);
            }
            queryClient.invalidateQueries({ queryKey: ['recipes', householdId] });
            const syntheticMsg: ChatMessage = {
              id: `sync-${event.at}-${Math.random().toString(36).slice(2, 8)}`,
              role: 'assistant',
              content: event.generatedByName
                ? `${event.generatedByName} just generated a meal${event.aiMessage ? `: ${event.aiMessage}` : ''}`
                : (event.aiMessage ?? 'A new meal was generated'),
              meal,
              timestamp: event.at,
            };
            setMessages((prev) => {
              if (prev.some((m) => m.id === syntheticMsg.id)) return prev;
              const updated = [...prev, syntheticMsg];
              saveMessages(updated);
              return updated;
            });
          } else if (event.type === 'recipe_added') {
            queryClient.invalidateQueries({ queryKey: ['recipes', householdId] });
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [householdId, token, partnerId, partnerSlot, queryClient]);

  const sendMessage = useCallback(
    async (text: string, opts?: { mode?: MealGenerationMode }) => {
      if (!householdId || !token || !text.trim()) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      const currentMessages = loadMessages();
      const updatedMessages = [...currentMessages, userMsg];
      saveMessages(updatedMessages);
      setMessages(updatedMessages);
      setIsTyping(true);
      setError(null);

      const history = updatedMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const result = await apiFetch<ServerResponse>(
          `/api/household/${householdId}/meal-chat`,
          {
            method: 'POST',
            body: { message: text.trim(), history, mode: opts?.mode ?? 'auto' },
            token,
          },
        );

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: result.message,
          meal: result.meal,
          addedToPantry: result.actions?.addToPantry,
          addedToList: result.actions?.addToList,
          clarification: result.clarification,
          timestamp: Date.now(),
        };

        const messagesWithReply = [...updatedMessages, assistantMsg];
        saveMessages(messagesWithReply);
        setMessages(messagesWithReply);

        if (result.actions?.addToPantry?.length || result.actions?.addToList?.length) {
          invalidateRelated();
        }
        if (result.meal) {
          queryClient.invalidateQueries({ queryKey: ['recipes', householdId] });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get response');
      } finally {
        setIsTyping(false);
      }
    },
    [householdId, token, nextId, queryClient],
  );

  const clearChat = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem('cooktwo_chat_counter'); } catch { /* ignore */ }
    setMessages([]);
    setError(null);
    idCounter = 0;
  }, []);

  return {
    messages,
    isTyping,
    error,
    sendMessage,
    clearChat,
  };
}
