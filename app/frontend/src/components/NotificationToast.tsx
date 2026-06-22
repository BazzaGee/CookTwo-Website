import { useEffect, useState } from 'react';
import { X, ShoppingCart, Check, Trash2, ArrowRight } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import { PartnerDot } from './PartnerDot';
import { useProfiles, resolvePartnerName } from '../hooks/useProfiles';

const ACTION_ICONS: Record<string, typeof ShoppingCart> = {
  added: ShoppingCart,
  'checked off': Check,
  unchecked: Check,
  removed: Trash2,
  'moved to pantry': ArrowRight,
  updated: ShoppingCart,
};

const AUTO_DISMISS_MS = 4000;

export function NotificationToast() {
  const toastQueue = useNotificationStore((s) => s.toastQueue);
  const dismissToast = useNotificationStore((s) => s.dismissToast);
  const { profiles } = useProfiles();
  const [visible, setVisible] = useState<string | null>(null);
  const [exiting, setExiting] = useState<string | null>(null);

  const current = toastQueue[0];

  useEffect(() => {
    if (!current) {
      setVisible(null);
      setExiting(null);
      return;
    }

    setVisible(current.id);

    const timer = setTimeout(() => {
      setExiting(current.id);
      setTimeout(() => {
        dismissToast(current.id);
        setVisible(null);
        setExiting(null);
      }, 300);
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [current?.id]);

  if (!current) return null;

  const Icon = ACTION_ICONS[current.action] ?? ShoppingCart;
  const isExiting = exiting === current.id;
  const isVisible = visible === current.id;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center pointer-events-none px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        className={`
          pointer-events-auto w-full max-w-md
          bg-white rounded-xl shadow-lg border border-border
          px-4 py-3 flex items-center gap-3
          transition-all duration-300 ease-out
          ${isVisible && !isExiting ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}
        `}
      >
        <PartnerDot slot={current.partnerSlot} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary leading-snug">
            <span className="font-semibold">{resolvePartnerName(profiles, current.partnerSlot)}</span>{' '}
            {current.action}
            {current.itemName && (
              <>
                {' '}
                <span className="font-medium text-terracotta">
                  {current.itemName}
                </span>
              </>
            )}
          </p>
        </div>
        <Icon size={16} className="text-text-secondary shrink-0" />
        <button
          type="button"
          onClick={() => {
            setExiting(current.id);
            setTimeout(() => dismissToast(current.id), 300);
          }}
          className="shrink-0 p-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-cream-dark transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
