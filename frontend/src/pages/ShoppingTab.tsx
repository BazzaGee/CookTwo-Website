import { useGroceryList } from '../hooks/useGroceryList';
import { ShoppingList } from '../components/ShoppingList';
import { AddItemForm } from '../components/AddItemForm';
import type { Category } from '../types/grocery';

export default function ShoppingTab() {
  const { items, addItem, toggleItem, deleteItem, moveCheckedToPantry, isMovingToPantry, isLoading, isOnline, queuedCount, reclassifyItem, reclassifyWithAI, isAIReclassifying } = useGroceryList();

  function handleAdd(input: { name: string }) {
    const text = input.name.trim();
    if (!text) return;
    const parts = text.split(/[,;]/).map((p) => p.trim()).filter((p) => p.length > 0);
    for (const part of parts) {
      addItem({ name: part });
    }
  }

  function handleReclassify(id: string, category: Category, isFood: boolean) {
    reclassifyItem({ id, category, isFood });
  }

  return (
    <>
      <div className="px-6 py-4 pb-40">
        {!isOnline && (
          <div className="mb-4 bg-terracotta/10 border border-terracotta/20 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="relative flex w-2 h-2" aria-hidden>
              <span className="absolute inline-flex w-full h-full rounded-full bg-terracotta opacity-60 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-terracotta" />
            </span>
            <p className="text-text-primary text-sm">
              You're offline.
              {queuedCount > 0 && (
                <span className="ml-1">
                  {queuedCount} item{queuedCount > 1 ? 's' : ''} will sync when you reconnect.
                </span>
              )}
            </p>
          </div>
        )}

        <div className="mb-4">
          <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
            Our shopping list
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {items.length === 0
              ? 'Add what you need below.'
              : items.filter((i) => !i.isChecked).length === 0
                ? "All done. You've got everything."
                : `${items.filter((i) => !i.isChecked).length} to buy`}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-text-secondary text-sm">Loading your list…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-primary text-2xl font-semibold tracking-tight">
              Your list is empty.
            </p>
            <p className="text-text-secondary text-base mt-2 leading-relaxed max-w-xs mx-auto">
              Type exactly what you need below — quantities, brands, specifics. Separate items with commas.
            </p>
          </div>
        ) : (
          <ShoppingList
            items={items}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onMoveToPantry={moveCheckedToPantry}
            isMovingToPantry={isMovingToPantry}
            onAskAI={() => reclassifyWithAI()}
            isAILoading={isAIReclassifying}
            onReclassifyItem={handleReclassify}
          />
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-10 bg-cream/95 backdrop-blur border-t border-terracotta/20 px-6 py-3">
        <AddItemForm onAdd={handleAdd} disabled={false} />
      </div>
    </>
  );
}
