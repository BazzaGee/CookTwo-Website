import { useState } from 'react';
import { Copy, X, Share2, Link } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

function getShareUrl(code: string): string {
  return `https://cooktwo.com/join?c=${encodeURIComponent(code)}`;
}

function getShareText(code: string): string {
  return `Join me on CookTwo: ${getShareUrl(code)}`;
}

export function ShareCodeButton() {
  const session = useAuthStore((s) => s.session);
  const [isOpen, setIsOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const code = session?.inviteCode;

  if (!code) return null;

  const digits = code.split('');
  const shareUrl = getShareUrl(code);
  const shareText = getShareText(code);

  async function handleShareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'CookTwo', text: shareText, url: shareUrl });
        setIsOpen(false);
        return;
      } catch {
        // user cancelled or share failed, fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function handleCopyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-cream-dark transition-colors"
        aria-label="Share invite code"
        title="Share invite code"
      >
        <Share2 size={18} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div
            className="bg-cream border border-border rounded-2xl p-6 mx-6 max-w-sm w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-text-primary text-lg font-semibold">Invite your partner</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-text-secondary text-sm leading-relaxed mb-6">
              Share this link with your partner. When they open it, they'll create their account and join your kitchen.
            </p>

            <div className="flex gap-2 justify-center mb-6">
              {digits.map((d, i) => (
                <div
                  key={i}
                  className="w-full aspect-square bg-white border border-border rounded-xl flex items-center justify-center text-text-primary text-2xl font-semibold"
                >
                  {d}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleShareLink}
              className="w-full bg-sage text-white font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 mb-3 hover:bg-sage-dark active:scale-[0.99]"
            >
              <Link size={16} />
              {copiedLink ? 'Copied link!' : 'Share invite link'}
            </button>

            <button
              type="button"
              onClick={handleCopyCode}
              className={`w-full font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 ${
                copiedCode
                  ? 'bg-sage/20 text-sage'
                  : 'bg-white border border-border text-text-primary hover:bg-cream-dark'
              }`}
            >
              <Copy size={16} />
              {copiedCode ? 'Copied!' : 'Copy code only'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
