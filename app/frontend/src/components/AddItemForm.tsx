import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { RegularsChips } from './RegularsChips';

interface Props {
  onAdd: (input: { name: string }) => void;
  disabled?: boolean;
}

export function AddItemForm({ onAdd, disabled }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const name = value.trim();
    if (!name) return;
    onAdd({ name });
    setValue('');
    inputRef.current?.focus();
  }

  const parts = value.trim() ? value.split(/[,;]/).filter((p) => p.trim()).length : 0;

  return (
    <div className="space-y-3">
      <RegularsChips onAdd={(name) => onAdd({ name })} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="milk, bread, chicken, dish soap…"
          disabled={disabled}
          className="flex-1 bg-white border border-border rounded-full px-5 py-3 text-text-primary text-base placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Add item"
          className="flex-shrink-0 w-12 h-12 bg-sage text-white rounded-full flex items-center justify-center hover:bg-sage-dark active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </form>
      {value.trim() && (
        <p className="text-text-secondary text-xs px-1">
          {parts > 1
            ? `${parts} items — categories auto-detected`
            : 'Category auto-detected'}
        </p>
      )}
    </div>
  );
}
