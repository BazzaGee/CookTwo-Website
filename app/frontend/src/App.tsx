import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import Onboarding from './pages/Onboarding';
import MainApp from './pages/MainApp';
import ShoppingTab from './pages/ShoppingTab';
import PantryTab from './pages/PantryTab';
import ProfilesTab from './pages/ProfilesTab';
import MealPlanTab from './pages/MealPlanTab';
import PaywallModal from './components/PaywallModal';
import { usePushNotifications } from './hooks/usePushNotifications';

const DEV_TOKEN = 'cooktwo-dev-2026';
const DEV_SKIP_FLAG = 'cfs.dev_skip_applied';

function DevSkipOnboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const devSkip = useAuthStore((s) => s.devSkipOnboarding);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasDevToken = params.get('dev') === DEV_TOKEN;
    const wantsSkip = params.has('skipOnboarding');
    const alreadyApplied = typeof window !== 'undefined' && localStorage.getItem(DEV_SKIP_FLAG) === '1';
    if ((hasDevToken && wantsSkip) || alreadyApplied) {
      if (hasDevToken && wantsSkip) {
        try { localStorage.setItem(DEV_SKIP_FLAG, '1'); } catch {}
      }
      devSkip();
      navigate('/shopping', { replace: true });
    }
  }, [location.search, devSkip, navigate]);

  return null;
}

function App() {
  return (
    <>
      <PaywallModal />
      <DevSkipOnboarding />
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/"
          element={<Gate requireAuthed><MainApp /></Gate>}
        >
          <Route index element={<Navigate to="/shopping" replace />} />
          <Route path="shopping" element={<ShoppingTab />} />
          <Route path="pantry" element={<PantryTab />} />
          <Route path="profiles" element={<ProfilesTab />} />
          <Route path="meal-plan" element={<MealPlanTab />} />
        </Route>
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    </>
  );
}

function Gate({
  children,
  requireAuthed,
}: {
  children: React.ReactNode;
  requireAuthed: boolean;
}) {
  const session = useAuthStore((s) => s.session);
  const hasCompleted = useAuthStore((s) => s.hasCompletedOnboarding);
  usePushNotifications();

  if (requireAuthed && !session) return <Navigate to="/onboarding" replace />;
  if (requireAuthed && session && !hasCompleted) return <Navigate to="/onboarding" replace />;
  if (!requireAuthed && session && hasCompleted) return <Navigate to="/shopping" replace />;
  return <>{children}</>;
}

export default App;
