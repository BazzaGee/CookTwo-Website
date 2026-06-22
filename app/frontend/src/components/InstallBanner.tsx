import { X, Download } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallBanner() {
  const { isInstallable, install, dismiss } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center bg-cream border-b border-border shadow-sm animate-slide-up">
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sage/10 rounded-full flex items-center justify-center">
            <Download size={16} className="text-sage" />
          </div>
          <div>
            <p className="text-text-primary text-sm font-medium">Add to Home Screen</p>
            <p className="text-text-secondary text-xs">Install CookTwo for quick access.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={install}
            className="bg-sage text-white text-sm font-medium py-2 px-4 rounded-full hover:bg-sage-dark transition-colors"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="p-1.5 rounded-full text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
