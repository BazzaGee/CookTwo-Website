import { useCallback } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';
import type { SyncEvent, PartnerSlot, GroceryItem } from '../types/grocery';

function eventToFingerprint(event: SyncEvent): string {
  if ('item' in event && event.item) return `${event.type}|${event.item.id}`;
  if ('items' in event && event.items) return `${event.type}|${event.items.map((i: GroceryItem) => i.id).join(',')}`;
  if ('id' in event && event.id) return `${event.type}|${event.id}`;
  if ('deletedIds' in event && event.deletedIds) return `${event.type}|${event.deletedIds.join(',')}`;
  return `${event.type}|${Date.now()}`;
}

function getPartnerSlotFromEvent(event: SyncEvent): PartnerSlot | null {
  if (event.type === 'item_added') return event.item.addedByPartnerSlot;
  if (event.type === 'items_added') return event.items[0]?.addedByPartnerSlot ?? null;
  if (event.type === 'item_toggled') return event.item.addedByPartnerSlot;
  if (event.type === 'item_updated') return event.item.addedByPartnerSlot;
  if (event.type === 'items_moved') return null;
  if (event.type === 'pantry_added') return event.item.addedByPartnerSlot;
  if (event.type === 'pantry_updated') return event.item.addedByPartnerSlot;
  return null;
}

function getActionFromEvent(event: SyncEvent): { action: string; itemName: string } | null {
  switch (event.type) {
    case 'item_added':
      return { action: 'added', itemName: event.item.name };
    case 'items_added':
      if (event.items.length === 1) return { action: 'added', itemName: event.items[0]?.name ?? '' };
      return { action: 'added', itemName: `${event.items.length} items` };
    case 'item_toggled':
      return { action: event.item.isChecked ? 'checked off' : 'unchecked', itemName: event.item.name };
    case 'item_deleted':
      return { action: 'removed', itemName: '' };
    case 'items_moved': {
      const count = event.deletedIds.length;
      return { action: 'moved to pantry', itemName: count === 1 ? '1 item' : `${count} items` };
    }
    case 'item_updated':
      return { action: 'updated', itemName: event.item.name };
    default:
      return null;
  }
}

const NOTIFICATION_EVENTS = new Set([
  'item_added',
  'items_added',
  'item_toggled',
  'item_deleted',
  'items_moved',
]);

export function useNotifications() {
  const mySlot = useAuthStore((s) => s.session?.partner.slot ?? 1);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const processEvent = useCallback(
    (event: SyncEvent) => {
      if (event.type === 'hello') return;
      if (!NOTIFICATION_EVENTS.has(event.type)) return;

      const eventSlot = getPartnerSlotFromEvent(event);
      if (eventSlot === null || eventSlot === mySlot) return;

      const actionInfo = getActionFromEvent(event);
      if (!actionInfo) return;

      addNotification({
        partnerSlot: eventSlot,
        action: actionInfo.action,
        itemName: actionInfo.itemName,
        eventType: event.type,
        eventFingerprint: eventToFingerprint(event),
      });
    },
    [mySlot, addNotification],
  );

  return { processEvent };
}
