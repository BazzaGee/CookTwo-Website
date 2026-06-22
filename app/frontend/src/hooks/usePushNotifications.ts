import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiFetch } from '../lib/api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const session = useAuthStore((s) => s.session);
  const subscribedRef = useRef(false);

  const subscribe = useCallback(async () => {
    if (!session?.token || !session?.householdId || !VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;

      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        if (subscribedRef.current) return;
        await saveSubscription(existingSub);
        subscribedRef.current = true;
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      await saveSubscription(subscription);
      subscribedRef.current = true;
    } catch (err) {
      console.error('Push subscription failed:', err);
    }
  }, [session?.token, session?.householdId]);

  const saveSubscription = useCallback(
    async (subscription: PushSubscription) => {
      if (!session?.token || !session?.householdId) return;

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

      await apiFetch(`/api/household/${session.householdId}/push/subscribe`, {
        method: 'POST',
        body: {
          partnerId: session.partner.id,
          slot: session.partner.slot,
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        },
        token: session.token,
      });
    },
    [session?.token, session?.householdId, session?.partner.id],
  );

  useEffect(() => {
    if (!session?.token || !session?.householdId) return;

    navigator.serviceWorker?.ready.then(() => {
      subscribe();
    });

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        saveSubscription(event.data.subscription);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handler);
    };
  }, [session?.token, session?.householdId, subscribe, saveSubscription]);

  return { subscribe };
}
