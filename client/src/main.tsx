import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { useAuth } from './lib/auth';
import { tryRefresh } from './lib/api';
import { Layout } from './app/layout';
import { Spinner } from './components/ui';
import { LandingPage } from './pages/landing';
import { VenuesPage } from './pages/venues';
import { VenueDetailPage } from './pages/venue-detail';
import { CheckoutPage } from './pages/checkout';
import { MyBookingsPage } from './pages/my-bookings';
import { LoginPage, RegisterPage, VerifyPage, ForgotPage, ResetPage } from './pages/auth';
import { OwnerDashboardPage } from './pages/owner/dashboard';
import { OwnerCalendarPage } from './pages/owner/calendar';
import { OwnerReportsPage } from './pages/owner/reports';
import { OwnerVenuesPage } from './pages/owner/venues';

const queryClient = new QueryClient();

/** Auth-only routes: wait for the boot refresh, then gate (§6.3). */
function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  return children;
}

function App() {
  const setReady = useAuth((s) => s.setReady);
  useEffect(() => {
    // silent session restore from the httpOnly refresh cookie
    void tryRefresh().finally(setReady);
  }, [setReady]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/venues" element={<VenuesPage />} />
        <Route path="/venues/:slug" element={<VenueDetailPage />} />
        <Route
          path="/book/:bookingId"
          element={
            <RequireAuth>
              <CheckoutPage />
            </RequireAuth>
          }
        />
        <Route
          path="/me/bookings"
          element={
            <RequireAuth>
              <MyBookingsPage />
            </RequireAuth>
          }
        />
        {(
          [
            ['/owner', <OwnerDashboardPage />],
            ['/owner/calendar', <OwnerCalendarPage />],
            ['/owner/reports', <OwnerReportsPage />],
            ['/owner/venues', <OwnerVenuesPage />],
          ] as const
        ).map(([path, page]) => (
          <Route key={path} path={path} element={<RequireAuth>{page}</RequireAuth>} />
        ))}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/auth/forgot" element={<ForgotPage />} />
        <Route path="/auth/reset" element={<ResetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
