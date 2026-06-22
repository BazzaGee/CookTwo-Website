import { useGroceryList, type ConnectionState } from '../hooks/useGroceryList';

const STATES: Record<ConnectionState, { color: string; label: string; pulse: boolean }> = {
  idle: { color: 'bg-text-secondary/40', label: 'Not connected', pulse: false },
  connecting: { color: 'bg-terracotta', label: 'Connecting\u2026', pulse: true },
  open: { color: 'bg-sage', label: 'Synced', pulse: false },
  closed: { color: 'bg-error', label: 'Offline', pulse: false },
};

export function SyncIndicator() {
  const { connectionState } = useGroceryList();
  const state = STATES[connectionState];

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={state.label}
      title={state.label}
    >
      <span className="relative flex w-2 h-2" aria-hidden>
        {state.pulse && (
          <span
            className={`absolute inline-flex w-full h-full rounded-full ${state.color} opacity-60 animate-ping`}
          />
        )}
        <span className={`relative inline-flex w-2 h-2 rounded-full ${state.color}`} />
      </span>
    </div>
  );
}
