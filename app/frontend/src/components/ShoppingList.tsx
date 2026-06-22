import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ShoppingBag, Sparkles } from 'lucide-react';
import { ItemRow } from './ItemRow';
import type { Category, GroceryItem } from '../types/grocery';

const CATEGORY_EMOJIS: Record<Category, string> = {
  Produce: '🥬',
  Meat: '🥩',
  Dairy: '🥛',
  Pantry: '🫙',
  Household: '🏠',
  'Personal Care': '🧴',
};

const CATEGORY_ORDER: Category[] = ['Produce', 'Meat', 'Dairy', 'Pantry', 'Household', 'Personal Care'];

interface Props {
  items: GroceryItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToPantry: () => void;
  isMovingToPantry: boolean;
  onAskAI: () => void;
  isAILoading: boolean;
}

export function ShoppingList({ items, onToggle, onDelete, onMoveToPantry, isMovingToPantry, onAskAI, isAILoading }: Props) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());
  const [showSortPulse, setShowSortPulse] = useState(false);
  const prevLoadingRef = useRef(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevLoadingRef.current && !isAILoading) {
      setShowSortPulse(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setShowSortPulse(false), 1500);
    }
    prevLoadingRef.current = isAILoading;
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [isAILoading]);

  const checkedItems = items.filter((i) => i.isChecked);
  const checkedFoodCount = checkedItems.filter((i) => i.isFood).length;
  const checkedNonFoodCount = checkedItems.filter((i) => !i.isFood).length;
  const needsReviewCount = items.filter((i) => i.needsReview).length;

  function toggleCategory(category: Category) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function expandAll() {
    setCollapsedCategories(new Set());
  }

  function collapseAll() {
    setCollapsedCategories(new Set(CATEGORY_ORDER));
  }

  const allExpanded = collapsedCategories.size === 0;
  const activeCategories = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c || (c === 'Pantry' && (i.category as string) === 'Other')));
  const allCollapsed = activeCategories.every((c) => collapsedCategories.has(c));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-xs font-medium">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
          {needsReviewCount > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              · {needsReviewCount} to review
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {allCollapsed && (
            <button
              type="button"
              onClick={expandAll}
              className="text-xs font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-cream-dark transition-colors"
            >
              + Expand all
            </button>
          )}
          {allExpanded && (
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-cream-dark transition-colors"
            >
              − Collapse all
            </button>
          )}
          {!allExpanded && !allCollapsed && (
            <>
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-cream-dark transition-colors"
              >
                + Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-cream-dark transition-colors"
              >
                − Collapse all
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onAskAI}
            disabled={isAILoading}
            className={`flex items-center gap-1.5 text-xs font-medium text-terracotta-dark hover:text-terracotta bg-terracotta/10 hover:bg-terracotta/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${showSortPulse ? 'brand-pulse' : ''}`}
          >
            <Sparkles size={12} />
            {isAILoading ? 'AI sorting…' : 'AI sort check'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {CATEGORY_ORDER.map((category) => {
          const categoryItems = items.filter((i) => i.category === category || (category === 'Pantry' && (i.category as string) === 'Other'));
          if (categoryItems.length === 0) return null;

          const unchecked = categoryItems.filter((i) => !i.isChecked);
          const checked = categoryItems.filter((i) => i.isChecked);
          const sorted = [...unchecked, ...checked];
          const isCollapsed = collapsedCategories.has(category);

          return (
            <div key={category} className="bg-white border border-border rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cream-dark transition-colors"
              >
                <span className="text-text-secondary" aria-hidden>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </span>
                <span className="text-base" aria-hidden>{CATEGORY_EMOJIS[category]}</span>
                <span className="text-text-primary text-sm font-semibold flex-1 text-left">{category}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-terracotta/10 text-terracotta-dark">
                  {unchecked.length > 0 ? `${unchecked.length} to buy` : 'done'}
                </span>
              </button>

              {!isCollapsed && (
                <ul className="border-t border-border/60 relative">
                  {sorted.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {checkedItems.length > 0 && (
        <div className="mt-4 mb-2">
          <button
            type="button"
            onClick={onMoveToPantry}
            disabled={isMovingToPantry}
            className="w-full flex items-center justify-center gap-2 bg-terracotta/10 border-2 border-terracotta/30 text-terracotta-dark rounded-2xl px-5 py-3 text-base font-medium hover:bg-terracotta/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <ShoppingBag size={18} />
            {isMovingToPantry ? (
              'Moving items…'
            ) : (
              <>
                Done shopping
                {checkedFoodCount > 0 && ` · ${checkedFoodCount} food item${checkedFoodCount > 1 ? 's' : ''} → pantry`}
                {checkedNonFoodCount > 0 && ` · ${checkedNonFoodCount} non-food removed`}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
