import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X, Sparkles } from 'lucide-react';
import { usePantry } from '../hooks/usePantry';
import { PartnerDot } from '../components/PartnerDot';
import type { PantryItem, Category } from '../types/grocery';

const CATEGORY_EMOJIS: Record<Category, string> = {
  Produce: '🥬',
  Meat: '🥩',
  Dairy: '🥛',
  Pantry: '🫙',
  Household: '🏠',
  'Personal Care': '🧴',
};

const CATEGORY_ORDER: Category[] = ['Produce', 'Meat', 'Dairy', 'Pantry', 'Household', 'Personal Care'];

export default function PantryTab() {
  const { items, addItem, deleteItem, isLoading, reclassifyWithAI, isAIReclassifying } = usePantry();
  const [input, setInput] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const parts = text.split(/[,;]/).map((p) => p.trim()).filter((p) => p.length > 0);

    for (const part of parts) {
      addItem({ name: part });
    }

    setInput('');
  }

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

  const needsReviewCount = items.filter((i) => i.needsReview).length;
  const allExpanded = collapsedCategories.size === 0;
  const activeCategories = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c || (c === 'Pantry' && (i.category as string) === 'Other')));
  const allCollapsed = activeCategories.every((c) => collapsedCategories.has(c));

  const groupedItems = items.reduce<Record<Category, PantryItem[]>>((acc, item) => {
    const cat = ((item.category as string) === 'Other' ? 'Pantry' : (item.category || 'Pantry')) as Category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<Category, PantryItem[]>);

  function formatItemDisplay(item: PantryItem): string {
    const qty = item.quantityValue && item.quantityUnit ? `${item.quantityValue} ${item.quantityUnit}` : '';
    const brand = item.brand || '';
    if (qty && brand) return `${item.name} (${qty}, ${brand})`;
    if (qty) return `${item.name} (${qty})`;
    if (brand) return `${item.name} (${brand})`;
    return item.name;
  }

  return (
    <div className="px-6 py-4">
      <div className="mb-4">
        <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
          Our kitchen
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {items.length === 0
            ? 'Tell us what you have.'
            : `${items.length} item${items.length > 1 ? 's' : ''} in your kitchen.`}
          {needsReviewCount > 0 && (
            <span className="text-amber-600 ml-1">· {needsReviewCount} to review</span>
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="1 litre whole milk, 250g Swiss cheddar, half an onion…"
            className="flex-1 bg-white border border-border rounded-full px-5 py-3 text-text-primary text-base placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Add to pantry"
            className="flex-shrink-0 w-12 h-12 bg-sage text-white rounded-full flex items-center justify-center hover:bg-sage-dark active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-text-secondary text-xs mt-2 px-1">
          Separate items with commas. Type exactly what you have — quantities, brands, all of it.
        </p>
      </form>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-text-secondary text-sm">Loading your pantry…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-primary text-2xl font-semibold tracking-tight">
            Your pantry is empty.
          </p>
          <p className="text-text-secondary text-base mt-2 leading-relaxed max-w-xs mx-auto">
            Type what you have above — "chicken, 2 cups rice, spinach" — or move checked items from your shopping list.
          </p>
        </div>
      ) : (
        <>
          {needsReviewCount >= 3 && (
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => reclassifyWithAI()}
                disabled={isAIReclassifying}
                className="flex items-center gap-1.5 text-xs font-medium text-terracotta-dark hover:text-terracotta bg-terracotta/10 hover:bg-terracotta/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
              >
                <Sparkles size={12} />
                {isAIReclassifying ? 'AI sorting…' : 'Ask AI to sort'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <span className="text-text-secondary text-xs font-medium">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
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
            </div>
          </div>

          <div className="space-y-2">
            {CATEGORY_ORDER.map((category) => {
              const categoryItems = groupedItems[category];
              if (!categoryItems || categoryItems.length === 0) return null;

              const isCollapsed = collapsedCategories.has(category);

              return (
                <div key={category} className="bg-white border border-border rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cream-dark transition-colors"
                  >
                    <span className="text-lg" aria-hidden>
                      {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </span>
                    <span className="text-lg" aria-hidden>{CATEGORY_EMOJIS[category]}</span>
                    <span className="text-text-primary text-base font-semibold flex-1 text-left">{category}</span>
                    <span className="text-text-secondary text-sm">{categoryItems.length}</span>
                  </button>

                  {!isCollapsed && (
                    <ul className="divide-y divide-border/60 relative">
                      {categoryItems.map((item) => (
                        <PantryRow
                          key={item.id}
                          item={item}
                          onDelete={deleteItem}
                          displayText={formatItemDisplay(item)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PantryRow({ item, onDelete, displayText }: {
  item: PantryItem;
  onDelete: (id: string) => void;
  displayText: string;
}) {
  return (
    <li className="group border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-3 py-3 px-4">
        {!item.isFood && (
          <span className="text-error text-sm flex-shrink-0" title="Not a food item">⚠️</span>
        )}
        <div className="flex-1">
          <span className={`text-base leading-snug ${!item.isFood ? 'text-text-secondary' : 'text-text-primary'}`}>{displayText}</span>
          {!item.isFood && (
            <span className="text-error text-xs ml-2">Not a food item</span>
          )}
        </div>

        {!item.needsReview && (
          <PartnerDot slot={item.addedByPartnerSlot} size={8} />
        )}

        <button
          type="button"
          onClick={() => onDelete(item.id)}
          aria-label={`Remove ${item.name}`}
          className={`flex-shrink-0 p-1 rounded-full transition-colors ${
            !item.isFood
              ? 'text-error hover:text-error-dark'
              : 'text-text-secondary/0 group-hover:text-text-secondary hover:!text-error'
          }`}
        >
          <X size={16} />
        </button>
      </div>
    </li>
  );
}
