import { Sparkles, X } from 'lucide-react';
import { usePaywallStore, type PaywallCode } from '../stores/paywallStore';
import { useBilling } from '../hooks/useBilling';

export default function PaywallModal() {
  const { visible, code, title, message, dismiss } = usePaywallStore();
  const { stripeAvailable, checkStripeStatus, checkout } = useBilling();

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary p-1"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="w-12 h-12 bg-terracotta/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles size={22} className="text-terracotta" />
        </div>

        <h2 className="text-text-primary text-xl font-semibold text-center mb-2">
          {title}
        </h2>

        <p className="text-text-secondary text-sm text-center leading-relaxed mb-6">
          {message}
        </p>

        {code && isUpgradeable(code) && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const avail = stripeAvailable ?? await checkStripeStatus();
                  if (!avail) {
                    dismiss();
                    const paywall = usePaywallStore.getState();
                    paywall.show('stripe_not_configured');
                    return;
                  }
                  await checkout('monthly');
                } catch {
                  dismiss();
                  const paywall = usePaywallStore.getState();
                  paywall.show('stripe_not_configured');
                }
              }}
              className="w-full bg-sage text-white font-medium py-3 px-6 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all"
            >
              Upgrade to Premium
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="w-full text-text-secondary text-sm font-medium py-2 hover:text-text-primary transition-colors"
            >
              Maybe later
            </button>
          </div>
        )}

        {code === 'stripe_not_configured' && (
          <button
            type="button"
            onClick={dismiss}
            className="w-full bg-cream text-text-primary font-medium py-3 px-6 rounded-xl border border-border hover:bg-cream-dark transition-colors"
          >
            Got it
          </button>
        )}

        {code && !isUpgradeable(code) && (
          <button
            type="button"
            onClick={dismiss}
            className="w-full bg-cream text-text-primary font-medium py-3 px-6 rounded-xl border border-border hover:bg-cream-dark transition-colors"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  );
}

function isUpgradeable(code: PaywallCode): boolean {
  return code === 'quota_exceeded' || code === 'premium_only' || code === 'image_quota_exceeded';
}
