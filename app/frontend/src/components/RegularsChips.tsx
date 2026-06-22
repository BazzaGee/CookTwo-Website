import { useRegulars, type RegularItem } from '../hooks/useRegulars';
import { useGroceryList } from '../hooks/useGroceryList';

function buildDisplayName(item: RegularItem): string {
  const parts: string[] = [];
  if (item.brand) parts.push(item.brand);
  parts.push(item.name);
  if (item.quantityValue != null && item.quantityUnit) {
    parts.push(`${item.quantityValue} ${item.quantityUnit}`);
  } else if (item.quantityValue != null) {
    parts.push(String(item.quantityValue));
  } else if (item.quantityUnit) {
    parts.push(item.quantityUnit);
  }
  return parts.join(' ');
}

interface Props {
  onAdd: (name: string) => void;
}

export function RegularsChips({ onAdd }: Props) {
  const { regulars, hasRegulars } = useRegulars();
  const { isAdding } = useGroceryList();

  if (!hasRegulars) return null;

  return (
    <div className="mb-4">
      <p className="text-text-secondary text-xs font-medium tracking-[0.15em] uppercase mb-2 px-1">
        Your regulars
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
        {regulars.map((item) => (
          <button
            key={`${item.name}-${item.brand}`}
            type="button"
            onClick={() => onAdd(buildDisplayName(item))}
            disabled={isAdding}
            className="flex-shrink-0 snap-start bg-sage/10 text-text-primary text-sm font-medium py-2 px-4 rounded-full hover:bg-sage/20 active:bg-sage/30 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {buildDisplayName(item)}
          </button>
        ))}
      </div>
    </div>
  );
}
