import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import { PartnerDot } from './PartnerDot';
import { useProfiles, resolvePartnerName } from '../hooks/useProfiles';

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount());
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const { profiles } = useProfiles();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const recent = notifications.slice(0, 20);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-cream-dark transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-terracotta text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 max-h-80 overflow-y-auto bg-white rounded-xl shadow-lg border border-border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Activity</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  markAllRead();
                }}
                className="flex items-center gap-1 text-xs text-sage hover:text-sage/80 font-medium transition-colors"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-secondary text-sm">
              No activity yet
            </div>
          ) : (
            <ul>
              {recent.map((n) => {
                return (
                  <li
                    key={n.id}
                    className={`
                      px-4 py-3 border-b border-border/50 last:border-b-0
                      transition-colors cursor-pointer
                      ${n.read ? 'bg-white' : 'bg-sage/5'}
                    `}
                    onClick={() => markAsRead(n.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        <PartnerDot slot={n.partnerSlot} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary leading-snug">
                          <span className="font-semibold">{resolvePartnerName(profiles, n.partnerSlot)}</span>{' '}
                          {n.action}
                          {n.itemName && (
                            <>
                              {' '}
                              <span className="font-medium text-terracotta">{n.itemName}</span>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {timeAgo(n.timestamp)}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-terracotta shrink-0 mt-1.5" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
