import type { PartnerSlot } from '../types/grocery';

export function PartnerDot({ slot, size = 8 }: { slot: PartnerSlot; size?: number }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full ${slot === 1 ? 'bg-sage' : 'bg-terracotta'}`}
      style={{ width: size, height: size }}
    />
  );
}
