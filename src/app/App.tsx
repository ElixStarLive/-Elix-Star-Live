import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '../pages/Login';
import Register from '../pages/Register';
import AuthCallback from '../pages/AuthCallback';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import Terms from '../pages/Terms';
import Privacy from '../pages/Privacy';
import LegalHub from '../pages/LegalHub';
import LegalDoc from '../pages/LegalDoc';
import VideoFeed from '../pages/VideoFeed';
import Profile from '../pages/Profile';
import Settings from '../pages/Settings';
import EditProfile from '../pages/EditProfile';
import { useAuthStore } from '../features/auth/authStore';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';

/** Public pages redirect an already-authenticated user to the authenticated root. */
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
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/legal" element={<LegalHub />} />
      <Route path="/copyright" element={<LegalDoc docKey="copyright" />} />
      <Route path="/guidelines" element={<LegalDoc docKey="guidelines" />} />
      <Route path="/how-it-works" element={<LegalDoc docKey="how-it-works" />} />
      <Route path="/support" element={<LegalDoc docKey="support" />} />
      <Route path="/legal/:docId" element={<LegalDoc />} />
      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthenticated>
            <ForgotPassword />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/reset-password"
        element={
          <RedirectIfAuthenticated>
            <ResetPassword />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        path="/feed"
        element={
          <RequireAuth>
            <AppShell>
              <VideoFeed />
            </AppShell>
          </RequireAuth>
        }
      />

      <Route
        path="/profile/:userId"
        element={
          <RequireAuth>
            <AppShell>
              <Profile />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <AppShell>
              <Profile />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <AppShell>
              <Settings />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/edit-profile"
        element={
          <RequireAuth>
            <AppShell>
              <EditProfile />
            </AppShell>
          </RequireAuth>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell>
              <VideoFeed />
            </AppShell>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
