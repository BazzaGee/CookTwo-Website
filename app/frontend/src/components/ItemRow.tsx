import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { PartnerDot } from './PartnerDot';
import type { GroceryItem, Category } from '../types/grocery';
import { CATEGORIES, FOOD_CATEGORIES } from '../types/grocery';

const CATEGORY_EMOJIS: Record<Category, string> = {
  Produce: '🥬',
  Meat: '🥩',
  Dairy: '🥛',
  Pantry: '🫙',
  Household: '🏠',
  'Personal Care': '🧴',
};

interface Props {
  item: GroceryItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onReclassify?: (id: string, category: Category, isFood: boolean) => void;
}

export function ItemRow({ item, onToggle, onDelete, onReclassify }: Props) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  function handleReclassify(category: Category) {
    onReclassify?.(item.id, category, FOOD_CATEGORIES.includes(category));
    setShowCategoryPicker(false);
  }

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

        {onReclassify && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              aria-label="Move to category"
              className="flex-shrink-0 p-1 rounded-md text-text-secondary/0 group-hover:text-text-secondary hover:!text-sage transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </button>
            {showCategoryPicker && (
              <div className="absolute right-0 top-8 z-20 bg-white border border-border rounded-xl shadow-lg p-2 min-w-44">
                <p className="text-text-secondary text-[10px] uppercase tracking-wide font-medium px-2 pb-1">Move to…</p>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleReclassify(cat)}
                    className={`w-full text-left text-sm py-1.5 px-2 rounded-lg hover:bg-cream transition-colors flex items-center gap-2 ${
                      item.category === cat ? 'text-sage font-medium' : 'text-text-primary'
                    }`}
                  >
                    <span>{CATEGORY_EMOJIS[cat]}</span>
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
