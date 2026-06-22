import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api';

const ACCESS_KEY = 'cfs.access';
const DEV_KEY = 'cooktwo-dev-2026';
const AUTH_KEY = 'cfs.auth';

type GateState = 'checking' | 'granted' | 'locked';

export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');

  useEffect(() => {
    async function checkAccess() {
      const params = new URLSearchParams(window.location.search);
      const devParam = params.get('dev');

      if (devParam === DEV_KEY) {
        params.delete('dev');
        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash}`;
        window.history.replaceState(null, '', newUrl);
        setState('granted');
        return;
      }

      const accessParam = params.get('access');

      const stored = localStorage.getItem(ACCESS_KEY);

      if (accessParam) {
        const valid = await validateToken(accessParam);
        if (valid) {
          localStorage.setItem(ACCESS_KEY, accessParam);
          params.delete('access');
          const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash}`;
          window.history.replaceState(null, '', newUrl);
          setState('granted');
          return;
        }
      }

      if (stored) {
        const valid = await validateToken(stored);
        if (valid) {
          setState('granted');
          return;
        }
        localStorage.removeItem(ACCESS_KEY);
      }

      // Also grant access if there's a valid auth session (user already onboarded)
      const authSession = localStorage.getItem(AUTH_KEY);
      if (authSession) {
        try {
          const parsed = JSON.parse(authSession);
          if (parsed?.state?.session?.token) {
            setState('granted');
            return;
          }
        } catch {
          // ignore invalid JSON
        }
      }

      setState('locked');
    }

    checkAccess();
  }, []);

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-sage/30 border-t-sage rounded-full animate-spin mx-auto mb-4" style={{ borderTopWidth: '3px' }} />
          <p className="text-text-secondary text-sm">Loading CookTwo...</p>
        </div>
      </div>
    );
  }

  if (state === 'granted') {
    return <>{children}</>;
  }

  return <LockedScreen />;
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await apiFetch<{ valid: boolean }>('/api/waitlist/validate-access', {
      method: 'POST',
      body: { access_token: token },
    });
    return res.valid === true;
  } catch {
    return false;
  }
}

function LockedScreen() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-sage/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-sage" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-3">CookTwo</h1>
        <p className="text-lg text-text-secondary mb-8">
          This app is available by invitation only. Enter your email on our website to get access.
        </p>
        <a
          href="https://couples-food-system-v3.pages.dev/"
          className="btn-primary inline-flex items-center justify-center gap-2"
        >
          Go to CookTwo
          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  );
}
