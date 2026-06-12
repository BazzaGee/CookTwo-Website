import { Check, X } from 'lucide-react';
import { PartnerDot } from './PartnerDot';
import type { GroceryItem } from '../types/grocery';

interface Props {
  item: GroceryItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ItemRow({ item, onToggle, onDelete }: Props) {
  return (
    <li className="border-b border-border/60 last:border-b-0 group">
      <div className="flex items-center gap-3 py-3 px-4">
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          aria-pressed={item.isChecked}
          aria-label={item.isChecked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
          className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
            item.isChecked
              ? 'bg-terracotta border-terracotta text-white'
              : 'border-border bg-white hover:border-terracotta'
          }`}
        >
          {item.isChecked && <Check size={14} strokeWidth={3} />}
        </button>

        {!item.isFood && (
          <span className="text-text-secondary text-xs flex-shrink-0" title="Non-food item">
            🏠
          </span>
        )}

        <span
          className={`flex-1 text-base leading-snug transition-all ${
            item.isChecked ? 'text-text-secondary line-through' : 'text-text-primary'
          }`}
        >
          {item.name}
          {item.brand && (
            <span className="text-text-secondary text-xs ml-1">({item.brand})</span>
          )}
        </span>

        {!item.needsReview && (
          <PartnerDot slot={item.addedByPartnerSlot} size={8} />
        )}

        <button
          type="button"
          onClick={() => onDelete(item.id)}
          aria-label={`Remove ${item.name}`}
          className="flex-shrink-0 p-1 rounded-full text-text-secondary/0 group-hover:text-text-secondary hover:!text-error transition-colors"
        >
          <X size={16} />
        </button>
      </div>


    </li>
  );
}
