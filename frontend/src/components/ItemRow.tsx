import { Check, X } from 'lucide-react';
import { PartnerDot } from './PartnerDot';
import type { GroceryItem, Category } from '../types/grocery';
import { FOOD_CATEGORIES } from '../types/grocery';

const CATEGORY_CHIPS: Array<{ category: Category; label: string }> = [
  { category: 'Produce', label: '🥬 Produce' },
  { category: 'Meat', label: '🥩 Meat' },
  { category: 'Dairy', label: '🥛 Dairy' },
  { category: 'Pantry', label: '🫙 Pantry' },
  { category: 'Household', label: '🏠 Household' },
  { category: 'Personal Care', label: '🧴 Personal Care' },
];

interface Props {
  item: GroceryItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onReclassify?: (id: string, category: Category, isFood: boolean) => void;
}

export function ItemRow({ item, onToggle, onDelete, onReclassify }: Props) {
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

      {item.needsReview && onReclassify && (
        <div className="px-4 pb-3 border-t border-dashed border-border/40">
          <div className="flex flex-wrap gap-1.5 pt-2">
            {CATEGORY_CHIPS.map(({ category, label }) => (
              <button
                key={category}
                type="button"
                onClick={() => onReclassify(item.id, category, FOOD_CATEGORIES.includes(category))}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  category === item.category
                    ? 'bg-sage/10 border-sage/40 text-sage-dark'
                    : 'border-border/60 bg-white hover:bg-sage/10 hover:border-sage/40 text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
