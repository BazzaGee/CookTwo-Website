import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Onboarding from './pages/Onboarding';
import MainApp from './pages/MainApp';
import ShoppingTab from './pages/ShoppingTab';
import PantryTab from './pages/PantryTab';
import ProfilesTab from './pages/ProfilesTab';
import MealPlanTab from './pages/MealPlanTab';
import PaywallModal from './components/PaywallModal';
import { usePushNotifications } from './hooks/usePushNotifications';

function App() {
  return (
    <>
      <PaywallModal />
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
