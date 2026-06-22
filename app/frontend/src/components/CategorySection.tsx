import { ItemRow } from './ItemRow';
import type { Category, GroceryItem } from '../types/grocery';

const CATEGORY_LABELS: Record<Category, string> = {
  Produce: '🥬 Produce',
  Meat: '🥩 Meat',
  Dairy: '🥛 Dairy',
  Pantry: '🫙 Pantry',
  Household: '🏠 Household',
  'Personal Care': '🧴 Personal Care',
};

interface Props {
  category: Category;
  items: GroceryItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CategorySection({ category, items, onToggle, onDelete }: Props) {
  if (items.length === 0) return null;

  const unchecked = items.filter((i) => !i.isChecked);
  const checked = items.filter((i) => i.isChecked);
  const sorted = [...unchecked, ...checked];

  return (
    <section className="mb-8">
      <h3 className="text-text-secondary text-xs font-medium tracking-[0.2em] uppercase mb-2 px-1">
        {CATEGORY_LABELS[category]}
        <span className="ml-2 text-text-secondary/60 normal-case tracking-normal">
          {unchecked.length > 0 ? `${unchecked.length} to buy` : 'done'}
        </span>
      </h3>
      <ul className="bg-white border border-border rounded-2xl px-4 divide-y divide-border/60">
        {sorted.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </section>
  );
}
