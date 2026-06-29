import { create } from 'zustand';

export type PaywallCode = 'quota_exceeded' | 'premium_only' | 'stripe_not_configured';

interface PaywallState {
  visible: boolean;
  code: PaywallCode | null;
  title: string;
  message: string;
  show: (code: PaywallCode, title?: string, message?: string) => void;
  dismiss: () => void;
}

const MESSAGES: Record<PaywallCode, { title: string; message: string }> = {
  quota_exceeded: {
    title: 'Out of AI requests for today',
    message: 'You\'ve used all your AI requests for today. Upgrade to Premium for 70 requests per day. Resets at midnight.',
  },
  premium_only: {
    title: 'Premium feature',
    message: 'This feature is only available on the Premium plan. Upgrade for 70 AI requests per day.',
  },
  stripe_not_configured: {
    title: 'Coming soon',
    message: 'Premium is coming soon! We\'ll let you know when it\'s available.',
  },
};

export const usePaywallStore = create<PaywallState>()((set) => ({
  visible: false,
  code: null,
  title: '',
  message: '',
  show: (code, title, message) =>
    set({
      visible: true,
      code,
      title: title || MESSAGES[code].title,
      message: message || MESSAGES[code].message,
    }),
  dismiss: () => set({ visible: false, code: null, title: '', message: '' }),
}));
