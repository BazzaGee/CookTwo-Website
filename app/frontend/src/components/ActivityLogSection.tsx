import { useState } from 'react';
import {
  RefreshCw, ShoppingCart, Check, Trash2, ArrowRight, Package,
  Sparkles, Bookmark, User, CalendarDays, UtensilsCrossed, Home, UserPlus,
} from 'lucide-react';
import { useActivityLog, type ActivityEntry } from '../hooks/useActivityLog';
import { useProfiles, resolvePartnerName } from '../hooks/useProfiles';

const ACTION_META: Record<string, { icon: typeof ShoppingCart; verb: (name: string | null) => string }> = {
  item_added: { icon: ShoppingCart, verb: () => 'added to the shopping list' },
  items_added: { icon: ShoppingCart, verb: (n) => `added ${n ?? 'items'} to the shopping list` },
  item_checked: { icon: Check, verb: () => 'checked off the list' },
  item_unchecked: { icon: Check, verb: () => 'unchecked on the list' },
  item_deleted: { icon: Trash2, verb: () => 'removed an item from the list' },
  items_moved_to_pantry: { icon: ArrowRight, verb: (n) => `moved ${n ?? 'items'} to the pantry` },
  item_updated: { icon: Package, verb: () => 'recategorized an item' },
  pantry_added: { icon: Package, verb: () => 'added to the pantry' },
  pantry_updated: { icon: Package, verb: () => 'updated a pantry item' },
  pantry_deleted: { icon: Trash2, verb: () => 'removed a pantry item' },
  meal_generated: { icon: Sparkles, verb: (n) => `generated a meal${n ? `: ${n}` : ''}` },
  recipe_saved: { icon: Bookmark, verb: (n) => `saved a recipe${n ? `: ${n}` : ''}` },
  recipe_deleted: { icon: Trash2, verb: () => 'deleted a saved recipe' },
  profile_updated: { icon: User, verb: () => 'updated their profile' },
  week_plan_generated: { icon: CalendarDays, verb: () => 'generated a weekly meal plan' },
  meal_confirmed: { icon: UtensilsCrossed, verb: () => 'cooked a meal (adjusted pantry)' },
  household_created: { icon: Home, verb: () => 'created this kitchen' },
  partner_joined: { icon: UserPlus, verb: () => 'joined this kitchen' },
  partner_linked: { icon: UserPlus, verb: () => 'linked to this kitchen' },
};

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { profiles, myProfile } = useProfiles();
  const meta = ACTION_META[entry.actionType] ?? { icon: Package, verb: () => entry.actionType };
  const Icon = meta.icon;

  const isMe = myProfile != null && entry.partnerId === myProfile.id;
  const actorName = entry.partnerSlot != null
    ? (isMe ? 'You' : resolvePartnerName(profiles, entry.partnerSlot))
    : (entry.partnerName ?? 'Someone');
  const possessive = isMe ? 'You' : actorName;

  return (
    <li className="flex items-start gap-3 py-3 border-b border-border/50 last:border-b-0">
      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${entry.partnerSlot === 1 ? 'bg-sage/15 text-sage' : entry.partnerSlot === 2 ? 'bg-terracotta/15 text-terracotta' : 'bg-cream-dark text-text-secondary'}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary leading-snug">
          <span className="font-semibold">{possessive}</span>{' '}
          {meta.verb(entry.targetName)}
          {entry.targetName && !['items_added', 'items_moved_to_pantry', 'meal_generated', 'recipe_saved'].includes(entry.actionType) && (
            <>
              {' '}
              <span className="font-medium text-terracotta">{entry.targetName}</span>
            </>
          )}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">{timeAgo(entry.createdAt)}</p>
      </div>
    </li>
  );
}

export function ActivityLogSection() {
  const { entries, isLoading, isFetching, refetch } = useActivityLog(50);
  const [open, setOpen] = useState(false);
  const hasOtherPartner = useProfiles().profiles.length > 1;

  return (
    <details className="bg-white border border-border rounded-2xl group" open={open}>
      <summary
        className="p-6 cursor-pointer list-none flex items-center justify-between hover:bg-cream/30 transition-colors rounded-2xl"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
          if (!open) refetch();
        }}
      >
        <div>
          <h3 className="text-text-primary text-lg font-semibold">Activity log</h3>
          <p className="text-text-secondary text-sm mt-0.5">
            {hasOtherPartner
              ? 'See what you and your partner have been doing.'
              : 'A traceable history of actions in your kitchen.'}
          </p>
        </div>
        <span className="text-text-secondary text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div className="px-6 pb-6 border-t border-border pt-2">
        <div className="flex items-center justify-end mb-2">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); refetch(); }}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary font-medium disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <p className="text-text-secondary text-sm text-center py-6">Loading activity…</p>
        ) : entries.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-6">No activity yet.</p>
        ) : (
          <ul>
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
