import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingBasket, Boxes, ChefHat, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { SyncIndicator } from '../components/SyncIndicator';
import { InstallBanner } from '../components/InstallBanner';
import { ShareCodeButton } from '../components/ShareCodeButton';
import { NotificationToast } from '../components/NotificationToast';
import { NotificationBell } from '../components/NotificationBell';
import UsageChip from '../components/UsageChip';
import { useProfiles } from '../hooks/useProfiles';

const tabs = [
  { to: '/shopping', label: 'Shopping', icon: ShoppingBasket },
  { to: '/pantry', label: 'Pantry', icon: Boxes },
  { to: '/meal-plan', label: 'Meals', icon: ChefHat },
] as const;

export default function MainApp() {
  const session = useAuthStore((s) => s.session);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const { profiles } = useProfiles();

  function handleSignOut() {
    clear();
    navigate('/onboarding', { replace: true });
  }

  function goToProfiles() {
    navigate('/profiles');
  }

  const partnerName = session?.partner.displayName ?? 'Partner';
  const p1 = profiles.find((p) => p.slot === 1);
  const p2 = profiles.find((p) => p.slot === 2);
  const headerLabel =
    p1 && p2 ? `${p1.name} + ${p2.name}` : partnerName;

  return (
    <div className="min-h-full bg-cream flex flex-col">
      <NotificationToast />
      <InstallBanner />
      <header className="px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 border-b-2 border-terracotta/40">
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1" aria-hidden>
            {p1 && (
              <span className="w-6 h-6 rounded-full bg-sage text-white text-xs font-semibold flex items-center justify-center ring-2 ring-cream">
                {p1.name.charAt(0).toUpperCase()}
              </span>
            )}
            {p2 && (
              <span className="w-6 h-6 rounded-full bg-terracotta text-white text-xs font-semibold flex items-center justify-center ring-2 ring-cream">
                {p2.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="text-text-primary text-sm font-semibold leading-tight">{headerLabel}</p>
            <p className="text-text-secondary text-xs leading-tight">Our shared kitchen</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <UsageChip />
          <NotificationBell />
          <SyncIndicator />
          <ShareCodeButton />
          <button
            type="button"
            onClick={goToProfiles}
            className="p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-cream-dark transition-colors"
            aria-label="Profiles & settings"
            title="Profiles & settings"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-cream-dark transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 scroll-smooth-ios">
        <div className="max-w-md mx-auto w-full">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-cream/95 backdrop-blur border-t-2 border-sage/40 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex justify-around max-w-md mx-auto">
          {tabs.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-colors ${
                    isActive ? 'text-terracotta' : 'text-text-secondary hover:text-text-primary'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon
                      size={22}
                      strokeWidth={isActive ? 2.25 : 1.75}
                      aria-hidden
                    />
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
