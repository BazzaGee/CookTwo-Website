import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category } from '../types/grocery';

const STORAGE_KEY = 'cfs.offline.queue';

interface QueuedAction {
  id: string;
  type: 'addItem';
  payload: { name: string; category: Category };
  timestamp: number;
}

function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(loadQueue().length);
  const draining = useRef(false);

  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
      drain();
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const push = useCallback((action: Omit<QueuedAction, 'id' | 'timestamp'>) => {
    const queue = loadQueue();
    queue.push({
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    saveQueue(queue);
    setQueueLength(queue.length);
  }, []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;

    let queue = loadQueue();
    while (queue.length > 0) {
      const action = queue[0];
      if (!action) break;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/household/__HOUSEHOLD_ID__/items`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(action.payload),
          },
        );
        if (res.ok) {
          queue.shift();
          saveQueue(queue);
          setQueueLength(queue.length);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    draining.current = false;
  }, []);

  return { isOnline, queueLength, push, drain };
}
