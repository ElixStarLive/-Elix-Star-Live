import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from '../pages/Login';
import Register from '../pages/Register';
import { useAuthStore } from '../features/auth/authStore';
import { SessionSummary } from './SessionSummary';

/**
 * Blocks a protected route until the persisted session has been resolved, so a
 * signed-in person is never bounced to the form during the boot round trip.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'restoring') return null;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Keeps a signed-in person off the sign-in form. */
function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);

  if (status === 'restoring') return null;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthenticated>
            <Register />
          </RedirectIfAuthenticated>
        }
      />
      {/*
        PAGE-006 (App Shell) takes ownership of "/" and of global navigation.
        Until it lands, the root shows the resolved session so authentication can
        be exercised end to end. It is not a feature and has no other callers.
      */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <SessionSummary />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
