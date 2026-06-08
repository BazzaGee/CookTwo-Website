import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { GeneratedMeal } from '../types/meal';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meal?: GeneratedMeal;
  addedToPantry?: string[];
  addedToList?: string[];
  timestamp: number;
}

interface ServerResponse {
  message: string;
  meal?: GeneratedMeal;
  actions?: {
    addToPantry?: string[];
    addToList?: string[];
  };
}

const PANTRY_QUERY_KEY = ['pantry'] as const;
const GROCERY_QUERY_KEY = ['grocery'] as const;

export function useMealChat() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const householdId = session?.householdId ?? '';
  const token = session?.token ?? '';
  const idCounter = useRef(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextId = useCallback(() => {
    idCounter.current += 1;
    return `msg-${idCounter.current}-${Date.now()}`;
  }, []);

  function invalidateRelated() {
    if (householdId) {
      queryClient.invalidateQueries({ queryKey: [...PANTRY_QUERY_KEY, householdId] });
      queryClient.invalidateQueries({ queryKey: [...GROCERY_QUERY_KEY, householdId] });
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!householdId || !token || !text.trim()) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
      setError(null);

      const history = [...messages, userMsg]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const result = await apiFetch<ServerResponse>(
          `/api/household/${householdId}/meal-chat`,
          {
            method: 'POST',
            body: { message: text.trim(), history },
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
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (result.actions?.addToPantry?.length || result.actions?.addToList?.length) {
          invalidateRelated();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get response');
      } finally {
        setIsTyping(false);
      }
    },
    [householdId, token, messages, nextId, queryClient],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    idCounter.current = 0;
  }, []);

  return {
    messages,
    isTyping,
    error,
    sendMessage,
    clearChat,
  };
}
