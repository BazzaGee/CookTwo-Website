import { useState } from 'react';
import { Sparkles, Check, ChevronRight, ExternalLink } from 'lucide-react';
import { useUsage } from '../hooks/useUsage';
import { useBilling, type BillingPlan } from '../hooks/useBilling';
import { usePaywallStore } from '../stores/paywallStore';

const MONTHLY_PRICE = 4.99;
const YEARLY_PRICE = 44.99;

export default function UpgradeSection() {
  const { usage, isLoading } = useUsage();
  const { stripeAvailable, checkStripeStatus, checkout, openPortal, checkingOut, portalLoading } = useBilling();
  const paywall = usePaywallStore((s) => s.show);
  const [plan, setPlan] = useState<BillingPlan>('monthly');
  const [stripeChecked, setStripeChecked] = useState(false);

  if (isLoading || !usage) return null;

  return (
    <section className="space-y-4 mb-8">
      <h2 className="text-text-primary text-lg font-semibold">Plan</h2>

      <div className="bg-white border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-text-secondary" />
            <h3 className="text-text-primary font-semibold">Free</h3>
          </div>
          {usage.tier === 'free' && (
            <span className="bg-cream text-text-secondary text-[11px] font-medium px-2.5 py-1 rounded-full">
              Current plan
            </span>
          )}
        </div>
        <p className="text-text-secondary text-sm">10 AI requests per day, shared with your partner</p>
        <ul className="mt-3 space-y-1.5">
          {['Chat with the meal planner', 'Generate dinners and full weeks', 'Save unlimited recipes'].map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-text-primary">
              <Check size={12} className="text-sage flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border border-sage/40 rounded-2xl p-5 relative overflow-hidden">
        {usage.tier === 'premium' && (
          <div className="absolute top-0 right-0">
            <div className="bg-sage text-white text-[10px] font-medium px-3 py-1 rounded-bl-xl">
              Active
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-sage" />
            <h3 className="text-text-primary font-semibold">Premium</h3>
          </div>
          {usage.tier === 'premium' && (
            <span className="bg-sage/10 text-sage text-[11px] font-medium px-2.5 py-1 rounded-full">
              Current plan
            </span>
          )}
        </div>

        {usage.tier !== 'premium' && (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setPlan('monthly')}
              className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg border transition-colors ${
                plan === 'monthly'
                  ? 'bg-sage/10 border-sage text-sage'
                  : 'bg-white border-border text-text-secondary'
              }`}
            >
              ${MONTHLY_PRICE}/mo
            </button>
            <button
              type="button"
              onClick={() => setPlan('yearly')}
              className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg border transition-colors ${
                plan === 'yearly'
                  ? 'bg-sage/10 border-sage text-sage'
                  : 'bg-white border-border text-text-secondary'
              }`}
            >
              ${YEARLY_PRICE}/yr
              <span className="ml-1 text-[10px] text-terracotta font-semibold">Save 25%</span>
            </button>
          </div>
        )}

        <p className="text-text-secondary text-sm">
          {usage.tier === 'premium'
            ? '70 AI requests and 3 AI-generated meal images per day'
            : '70 AI requests and 3 AI-generated meal images per day, shared with your partner'
          }
        </p>
        <ul className="mt-3 space-y-1.5">
          {[
            '7× more AI requests',
            'Generate meal photos from your recipes',
            'Priority AI responses',
            'Cancel anytime',
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-text-primary">
              <Check size={12} className="text-sage flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        {usage.tier === 'premium' ? (
          <div className="mt-4 space-y-2">
            <p className="text-text-secondary text-xs">
              Billed {usage.planPeriod}ly{usage.currentPeriodEnd ? ` · Next charge ${new Date(usage.currentPeriodEnd).toLocaleDateString()}` : ''}
              {usage.cancelAtPeriodEnd ? ' · Cancels at period end' : ''}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await openPortal();
                } catch {
                  paywall('stripe_not_configured');
                }
              }}
              disabled={portalLoading}
              className="w-full bg-cream text-text-primary text-sm font-medium py-3 px-4 rounded-xl border border-border hover:bg-cream-dark transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {portalLoading ? 'Loading…' : 'Manage subscription'}
              <ExternalLink size={14} />
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={async () => {
                try {
                  const avail = stripeChecked ? stripeAvailable : await checkStripeStatus();
                  setStripeChecked(true);
                  if (!avail) {
                    paywall('stripe_not_configured');
                    return;
                  }
                  await checkout(plan);
                } catch {
                  paywall('stripe_not_configured');
                }
              }}
              disabled={checkingOut}
              className="w-full bg-sage text-white text-sm font-medium py-3 px-4 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {checkingOut ? 'Redirecting…' : `Upgrade to Premium — $${plan === 'monthly' ? MONTHLY_PRICE : YEARLY_PRICE}`}
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
