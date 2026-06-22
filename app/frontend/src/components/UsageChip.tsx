import { useState, useRef, useEffect } from 'react';
import { Sparkles, ImageIcon, BarChart3, X, ChevronRight } from 'lucide-react';
import { useUsage } from '../hooks/useUsage';
import { useBilling } from '../hooks/useBilling';
import { usePaywallStore } from '../stores/paywallStore';

function formatTimeRemaining(resetsAt: string): string {
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return 'resetting…';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function UsageChip() {
  const { usage, isLoading } = useUsage();
  const { checkStripeStatus } = useBilling();
  const paywall = usePaywallStore((s) => s.show);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [showPulse, setShowPulse] = useState(false);
  const prevUsedRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkStripeStatus();
  }, [checkStripeStatus]);

  useEffect(() => {
    if (usage && prevUsedRef.current !== null && usage.usedToday > prevUsedRef.current) {
      setShowPulse(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setShowPulse(false), 1500);
    }
    if (usage) prevUsedRef.current = usage.usedToday;
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [usage?.usedToday]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (isLoading || !usage) return null;

  const aiPct = usage.dailyQuota > 0 ? (usage.usedToday / usage.dailyQuota) * 100 : 0;
  const imgPct = usage.dailyImageQuota > 0 ? (usage.imagesUsedToday / usage.dailyImageQuota) * 100 : 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${showPulse ? 'brand-pulse' : ''} ${
          usage.tier === 'premium'
            ? 'bg-sage/15 text-sage hover:bg-sage/25'
            : aiPct >= 80
              ? 'bg-terracotta/15 text-terracotta hover:bg-terracotta/25'
              : aiPct >= 50
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-sage/15 text-sage hover:bg-sage/25'
        }`}
        aria-label={`${usage.remaining} of ${usage.dailyQuota} AI requests remaining`}
        title={`${usage.remaining} of ${usage.dailyQuota} AI requests`}
      >
        <Sparkles size={11} />
        <span>{usage.remaining}/{usage.dailyQuota}</span>
        {usage.tier === 'premium' && (
          <span className="text-[9px] opacity-70">✦</span>
        )}
        {usage.dailyImageQuota > 0 && (
          <span className="flex items-center gap-0.5 ml-0.5 opacity-70">
            <ImageIcon size={9} />
            <span>{usage.imagesRemaining}/{usage.dailyImageQuota}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-1/2 -translate-x-1/2 top-20 w-[calc(100vw-2rem)] max-w-72 bg-white border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-text-primary text-sm font-semibold flex items-center gap-1.5">
                <BarChart3 size={14} className="text-terracotta" />
                Usage today
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary p-0.5">
                <X size={14} />
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-secondary">AI requests</span>
                <span className="text-text-primary font-medium">
                  {usage.usedToday}/{usage.dailyQuota}
                </span>
              </div>
              <div className="h-2 bg-cream rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    aiPct >= 80 ? 'bg-terracotta' : aiPct >= 50 ? 'bg-amber-400' : 'bg-sage'
                  }`}
                  style={{ width: `${Math.min(aiPct, 100)}%` }}
                />
              </div>
            </div>

            {usage.dailyImageQuota > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary">Meal images</span>
                  <span className="text-text-primary font-medium">
                    {usage.imagesUsedToday}/{usage.dailyImageQuota}
                  </span>
                </div>
                <div className="h-2 bg-cream rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      imgPct >= 80 ? 'bg-terracotta' : imgPct >= 50 ? 'bg-amber-400' : 'bg-sage'
                    }`}
                    style={{ width: `${Math.min(imgPct, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-text-secondary text-[11px]">
              Resets in {formatTimeRemaining(usage.resetsAt)}
            </p>

            {usage.tier === 'free' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  paywall('stripe_not_configured');
                }}
                className="w-full bg-sage text-white text-sm font-medium py-2.5 px-4 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
              >
                Upgrade to Premium
                <ChevronRight size={14} />
              </button>
            )}

            {usage.tier === 'premium' && (
              <p className="text-sage text-[11px] font-medium text-center">
                Premium plan{usage.planPeriod ? ` · ${usage.planPeriod}` : ''}
                {usage.cancelAtPeriodEnd ? ' · cancels at period end' : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
