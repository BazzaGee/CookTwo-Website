import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { Category } from '../types/grocery';
import { FOOD_CATEGORIES } from '../types/grocery';

const CATEGORY_CHIPS: Array<{ category: Category; emoji: string; label: string }> = [
  { category: 'Produce', emoji: '🥬', label: 'Produce' },
  { category: 'Meat', emoji: '🥩', label: 'Meat' },
  { category: 'Dairy', emoji: '🥛', label: 'Dairy' },
  { category: 'Pantry', emoji: '🫙', label: 'Pantry' },
  { category: 'Household', emoji: '🏠', label: 'Household' },
  { category: 'Personal Care', emoji: '🧴', label: 'Personal Care' },
];

interface ReviewItem {
  id: string;
  name: string;
  category: Category;
  isFood: boolean;
}

interface Props {
  items: ReviewItem[];
  onReclassify: (id: string, category: Category, isFood: boolean) => void;
  onDelete: (id: string) => void;
  onAskAI: () => void;
  isAILoading: boolean;
}

export function ReviewQueue({ items, onReclassify, onDelete, onAskAI, isAILoading }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleItems = items.filter((i) => !dismissed.has(i.id));

  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-text-primary text-sm font-semibold flex items-center gap-2">
          <span className="text-amber-500">⚠️</span>
          {visibleItems.length} item{visibleItems.length > 1 ? 's' : ''} need{visibleItems.length === 1 ? 's' : ''} sorting
        </h2>
        {visibleItems.length >= 2 && (
          <button
            type="button"
            onClick={onAskAI}
            disabled={isAILoading}
            className="flex items-center gap-1.5 text-xs font-medium text-sage-dark hover:text-sage bg-sage/10 hover:bg-sage/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            <Sparkles size={12} />
            {isAILoading ? 'Sorting…' : 'Ask AI to sort'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visibleItems.map((item) => (
          <div key={item.id} className="bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-text-primary text-sm font-medium flex-1 truncate">{item.name}</span>
              <span className="text-text-secondary text-xs">Currently: {item.category}</span>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="text-text-secondary/50 hover:text-error transition-colors flex-shrink-0"
                aria-label={`Remove ${item.name}`}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_CHIPS.map(({ category, emoji, label }) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    onReclassify(item.id, category, FOOD_CATEGORIES.includes(category));
                    setDismissed((prev) => new Set(prev).add(item.id));
                  }}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/60 bg-white hover:bg-sage/10 hover:border-sage/40 text-text-primary transition-colors"
                >
                  {emoji} {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onDelete(item.id);
                  setDismissed((prev) => new Set(prev).add(item.id));
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-border/60 bg-white hover:bg-error/10 hover:border-error/40 text-text-secondary transition-colors"
              >
                🗑 Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
