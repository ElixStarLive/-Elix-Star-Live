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
import Inbox from '../pages/Inbox';
import SearchPage from '../pages/SearchPage';
import FollowingFeed from '../pages/FollowingFeed';
import FriendsFeed from '../pages/FriendsFeed';
import Upload from '../pages/Upload';
import VideoView from '../pages/VideoView';
import Admin from '../pages/Admin';
import AdminUsers from '../pages/AdminUsers';
import AdminReports from '../pages/AdminReports';
import AdminEconomy from '../pages/AdminEconomy';
import AdminProgression from '../pages/AdminProgression';
import AdminRisingStars from '../pages/AdminRisingStars';
import AdminPayouts from '../pages/AdminPayouts';
import SavedVideos from '../pages/SavedVideos';
import Discover from '../pages/Discover';
import RisingStars from '../pages/RisingStars';
import STEMFeed from '../pages/STEMFeed';
import Hashtag from '../pages/Hashtag';
import Report from '../pages/Report';
import FollowList from '../pages/FollowList';
import CreatorLoginDetails from '../pages/CreatorLoginDetails';
import SettingsNotifications from '../pages/SettingsNotifications';
import SettingsSecurity from '../pages/SettingsSecurity';
import SettingsBlocked from '../pages/SettingsBlocked';
import SettingsPayout from '../pages/SettingsPayout';
import Music from '../pages/Music';
import SongDetail from '../pages/SongDetail';
import Live from '../pages/Live';
import LiveWatch from '../pages/LiveWatch';
import AlertsPage from '../pages/AlertsPage';
import ChatThread from '../pages/ChatThread';
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
        path="/following"
        element={
          <RequireAuth>
            <AppShell>
              <FollowingFeed />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/friends"
        element={
          <RequireAuth>
            <AppShell>
              <FriendsFeed />
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
        path="/inbox"
        element={
          <RequireAuth>
            <AppShell>
              <Inbox />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/alerts"
        element={
          <RequireAuth>
            <AppShell>
              <AlertsPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/upload"
        element={
          <RequireAuth>
            <AppShell>
              <Upload />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/video/:videoId"
        element={
          <RequireAuth>
            <AppShell>
              <VideoView />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AppShell>
              <Admin />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/music/:songId"
        element={
          <RequireAuth>
            <AppShell>
              <SongDetail />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/live"
        element={
          <RequireAuth>
            <AppShell>
              <Live />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/live/:streamId"
        element={
          <RequireAuth>
            <AppShell>
              <LiveWatch />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/music"
        element={
          <RequireAuth>
            <AppShell>
              <Music />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/payout"
        element={
          <RequireAuth>
            <AppShell>
              <SettingsPayout />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/blocked"
        element={
          <RequireAuth>
            <AppShell>
              <SettingsBlocked />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/security"
        element={
          <RequireAuth>
            <AppShell>
              <SettingsSecurity />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/notifications"
        element={
          <RequireAuth>
            <AppShell>
              <SettingsNotifications />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/creator/login-details"
        element={
          <RequireAuth>
            <AppShell>
              <CreatorLoginDetails />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/report/:targetType/:targetId"
        element={
          <RequireAuth>
            <AppShell>
              <Report />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/profile/:userId/:type"
        element={
          <RequireAuth>
            <AppShell>
              <FollowList />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/report"
        element={
          <RequireAuth>
            <AppShell>
              <Report />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/hashtag/:tag"
        element={
          <RequireAuth>
            <AppShell>
              <Hashtag />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/stem"
        element={
          <RequireAuth>
            <AppShell>
              <STEMFeed />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/discover"
        element={
          <RequireAuth>
            <AppShell>
              <Discover />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/rising-stars"
        element={
          <RequireAuth>
            <AppShell>
              <RisingStars />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/saved"
        element={
          <RequireAuth>
            <AppShell>
              <SavedVideos />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/payouts"
        element={
          <RequireAuth>
            <AppShell>
              <AdminPayouts />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/rising-stars"
        element={
          <RequireAuth>
            <AppShell>
              <AdminRisingStars />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/progression"
        element={
          <RequireAuth>
            <AppShell>
              <AdminProgression />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/economy"
        element={
          <RequireAuth>
            <AppShell>
              <AdminEconomy />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireAuth>
            <AppShell>
              <AdminReports />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth>
            <AppShell>
              <AdminUsers />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/search"
        element={
          <RequireAuth>
            <AppShell>
              <SearchPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/inbox/:threadId"
        element={
          <RequireAuth>
            <AppShell>
              <ChatThread />
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
