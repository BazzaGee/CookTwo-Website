import { useCallback, useEffect, useRef, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const promptRef = useRef<InstallPromptEvent | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      promptRef.current = e as InstallPromptEvent;
      setIsInstallable(true);
    }

    window.addEventListener('beforeinstallprompt', handler);

    const mq = window.matchMedia('(display-mode: standalone)');
    setIsInstalled(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq.addEventListener('change', onChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      mq.removeEventListener('change', onChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptRef.current) return;
    promptRef.current.prompt();
    const choice = await promptRef.current.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setIsInstallable(false);
    promptRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    setIsInstallable(false);
    promptRef.current = null;
  }, []);

  return { isInstallable, isInstalled, install, dismiss };
}
