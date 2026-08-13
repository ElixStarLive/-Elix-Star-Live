import React, { useEffect, useRef, useCallback, Suspense } from "react";
import { lazyWithRetry as lazy } from "./lib/lazyWithRetry";
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  useParams,
  Navigate,
} from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { TopNav } from "./components/TopNav";
import { useAuthStore } from "./store/useAuthStore";
import { cn } from "./lib/utils";
import { useDeepLinks } from "./lib/deepLinks";
import { namedExitForLocation } from "./lib/settingsNav";
import { analytics } from "./lib/analytics";
import { notificationService } from "./lib/notifications";
import { initializeIAP, reconcileOwnedCoinPurchases } from "./lib/iap";
import { crashReporting } from "./lib/crashReporting";
import { reportFailure } from "./lib/reportFailure";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { IncomingCallModal } from "./components/IncomingCallModal";
import { LiveNotifyBanner } from "./components/LiveNotifyBanner";
import { subscribeToIncomingCalls } from "./lib/callService";
import { websocket } from "./lib/websocket";
import { useSoundLibraryPlayerStore } from "./store/useSoundLibraryPlayerStore";
import { useSafetyStore } from "./store/useSafetyStore";
import SpectatorLiveShell from "./features/live/spectator/SpectatorLiveShell";
import ProfileLiveOverlay from "./features/live/spectator/ProfileLiveOverlay";


// Lazy-loaded page components for code splitting
const VideoFeed = lazy(() => import("./pages/VideoFeed"));
const StemFeed = lazy(() => import("./pages/StemFeed"));
const LiveStream = lazy(() => import("./pages/LiveStream"));
const LiveDiscover = lazy(() => import("./pages/LiveDiscover"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Upload = lazy(() => import("./pages/Upload"));
const Create = lazy(() => import("./pages/Create"));
const SavedVideos = lazy(() => import("./pages/SavedVideos"));
const MusicFeed = lazy(() => import("./pages/MusicFeed"));
const FollowingFeed = lazy(() => import("./pages/FollowingFeed"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const VideoView = lazy(() => import("./pages/VideoView"));
const Inbox = lazy(() => import("./pages/Inbox"));
const AlertsPage = lazy(() => import("./pages/alerts/AlertsPage"));
const ChatThread = lazy(() => import("./pages/ChatThread"));
const FriendsFeed = lazy(() => import("./pages/FriendsFeed"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const EngagementHub = lazy(() => import("./pages/engagement/EngagementHub"));
const EngagementMissions = lazy(() => import("./pages/engagement/EngagementMissions"));
const EngagementFanLevel = lazy(() => import("./pages/engagement/EngagementFanLevel"));
const EngagementMvp = lazy(() => import("./pages/engagement/EngagementMvp"));
const EngagementAchievements = lazy(() => import("./pages/engagement/EngagementAchievements"));
const EngagementRewards = lazy(() => import("./pages/engagement/EngagementRewards"));
const EngagementDailyLogin = lazy(() => import("./pages/engagement/EngagementDailyLogin"));
const EngagementCollections = lazy(() => import("./pages/engagement/EngagementCollections"));
const FollowList = lazy(() => import("./pages/FollowList"));
const CreatorPayout = lazy(() => import("./pages/CreatorPayout"));
const CreatorLoginDetails = lazy(() => import("./pages/CreatorLoginDetails"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Copyright = lazy(() => import("./pages/Copyright"));
const Legal = lazy(() => import("./pages/Legal"));
const LegalAudio = lazy(() => import("./pages/LegalAudio"));
const LegalUGC = lazy(() => import("./pages/LegalUGC"));
const LegalAffiliate = lazy(() => import("./pages/LegalAffiliate"));
const LegalDMCA = lazy(() => import("./pages/LegalDMCA"));
const LegalSafety = lazy(() => import("./pages/LegalSafety"));
const LegalSupplier = lazy(() => import("./pages/LegalSupplier"));
const RequireAuth = lazy(() => import("./components/RequireAuth"));
const RequireAdmin = lazy(() => import("./components/RequireAdmin"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Discover = lazy(() => import("./pages/Discover"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const AdminEconomy = lazy(() => import("./pages/admin/Economy"));
const AdminMonetisation = lazy(() => import("./pages/admin/Monetisation"));
const Hashtag = lazy(() => import("./pages/Hashtag"));
const BlockedAccounts = lazy(() => import("./pages/settings/BlockedAccounts"));
const SafetyCenter = lazy(() => import("./pages/settings/SafetyCenter"));
const PurchaseCoins = lazy(() => import("./pages/PurchaseCoins"));
const Shop = lazy(() => import("./pages/Shop"));
const Report = lazy(() => import("./pages/Report"));
const Support = lazy(() => import("./pages/Support"));
const Guidelines = lazy(() => import("./pages/Guidelines"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const VideoCall = lazy(() => import("./pages/VideoCall"));
const AIStudio = lazy(() => import("./pages/AIStudio"));
const RisingStars = lazy(() => import("./pages/RisingStars"));
const RisingStarsChallenge = lazy(() => import("./pages/RisingStarsChallenge"));
const AdminRisingStars = lazy(() => import("./pages/admin/RisingStars"));
const AdminProgression = lazy(() => import("./pages/admin/Progression"));
const AdminPurchases = lazy(() => import("./pages/admin/Purchases"));
const AdminWithdrawals = lazy(() => import("./pages/admin/Withdrawals"));
const SecuritySettings = lazy(() => import("./pages/settings/SecuritySettings"));
const NotificationSettings = lazy(
  () => import("./pages/settings/NotificationSettings"),
);

function LiveStreamKeyed() {
  const loc = useLocation();
  return <LiveStream key={loc.pathname + loc.search} />;
}

function LiveStreamGuard() {
  const loc = useLocation();
  const { user } = useAuthStore();
  const params = (loc.pathname.match(/^\/live\/(.+)/) || [])[1];
  // ?battle=1 only routes to the LiveStream page. The battle-creator role is
  // authorized on the server: LiveStream must obtain a LiveKit publish token
  // (issued only against a real battle grant recorded at invite accept) and
  // redirects everyone else to the spectator page.
  const isBattleJoin = new URLSearchParams(loc.search).get("battle") === "1";
  // If the current user is the owner of this live (their own user id or /live/broadcast),
  // keep them on the LiveStream page. Everyone else is redirected to Spectator (watch),
  // except explicit battle joiners.
  if (
    params &&
    params !== "broadcast" &&
    params !== "start" &&
    params !== "watch" &&
    params !== user?.id &&
    !isBattleJoin
  ) {
    return <Navigate to={`/watch/${params}`} replace />;
  }
  return <LiveStreamKeyed />;
}

// Loading fallback for lazy-loaded routes
function PageLoader() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center text-white p-4">
      <div className="w-16 h-16 border-4 border-secondary border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-white/70">Loading...</p>
    </div>
  );
}

function LiveWatchRedirect() {
  const { streamId } = useParams();
  return <Navigate to={`/watch/${streamId}`} replace />;
}

const EDGE_SWIPE_WIDTH = 24;
const SWIPE_THRESHOLD = 60;

function App() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const handleEdgeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleEdgeTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!swipeStart.current) return;
      const endX = e.changedTouches[0].clientX;
      const dx = endX - swipeStart.current.x;
      swipeStart.current = null;
      if (dx > SWIPE_THRESHOLD) {
        const exit = namedExitForLocation(location.pathname, location.state);
        if (exit !== location.pathname) navigate(exit, { replace: true });
      }
    },
    [navigate, location.pathname, location.state],
  );

  // Initialize deep links
  useDeepLinks();

  // Auth: wait for persisted session (Preferences on Android) before /api/auth/me.
  // Running checkUser before hydration used no token, cleared state, and could overwrite saved login.
  useEffect(() => {
    const runCheckUser = () => {
      void useAuthStore.getState().checkUser();
    };
    if (useAuthStore.persist.hasHydrated()) {
      runCheckUser();
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(runCheckUser);
      return unsub;
    }
  }, []);

  // After login, sync blocked users and purge their videos from For You / feeds.
  const authUserId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!authUserId) return;
    void useSafetyStore.getState().hydrateBlockedFromServer();
  }, [authUserId]);

  useEffect(() => {
    try {
      analytics.initialize();
    } catch (_) {
      /* avoid crashing app */
    }
    void notificationService.initialize().catch(() => {
      /* async push init — never block app */
    });
    void initializeIAP().catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err || "iap_init_failed"));
      void crashReporting.logError(error, { source: "initializeIAP" });
    });
  }, []);

  useEffect(() => {
    if (user?.id) {
      analytics.setUserId(user.id);
      void notificationService.registerTokenWithBackend().catch((e) => reportFailure('push_register', e));
      void reconcileOwnedCoinPurchases().catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err || "iap_reconcile_failed"));
        void crashReporting.logError(error, { source: "reconcileOwnedCoinPurchases" });
      });
      const unsubCalls = subscribeToIncomingCalls(user.id);

      const onForceDisconnect = () => {
        void useAuthStore.getState().signOut().catch((e) => reportFailure('force_disconnect_signout', e));
      };
      websocket.on("force_disconnect", onForceDisconnect);
      websocket.on("user_banned", onForceDisconnect);

      // Feed presence owned by the websocket singleton. Sync on auth + route —
      // not a polling timer. Live screens take over the singleton for room IDs.
      const syncFeedPresence = () => {
        const token = useAuthStore.getState().session?.access_token;
        if (!token) return;
        const path = location.pathname;
        const onLiveSurface =
          path.startsWith("/live/") ||
          path.startsWith("/watch/") ||
          path === "/live/broadcast" ||
          path === "/call";
        if (onLiveSurface) return;
        try {
          // For You inline live preview joins the real stream room on the same
          // singleton. Do not yank it back to __feed__ while that room is active
          // (that dropped cohost_layout_sync and left full-bleed solo cards).
          const currentRoom = websocket.getCurrentRoomId();
          if (currentRoom && currentRoom !== "__feed__") return;
          if (!websocket.isConnected() || currentRoom !== "__feed__") {
            websocket.connect("__feed__", token, { persistent: true });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err || "feed_presence_failed"));
          void crashReporting.logError(error, { source: "syncFeedPresence" });
        }
      };
      syncFeedPresence();

      return () => {
        unsubCalls();
        websocket.off("force_disconnect", onForceDisconnect);
        websocket.off("user_banned", onForceDisconnect);
      };
    } else {
      analytics.setUserId(null);
    }
  }, [user, location.pathname]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        try {
          websocket.reconnectOnForeground();
        } catch (_) {
          /* avoid startup crashes from websocket reconnect */
        }
        // Soft session refresh + recover stuck IAP without forcing logout on blips.
        void useAuthStore.getState().checkUser();
        if (useAuthStore.getState().user?.id) {
          void reconcileOwnedCoinPurchases().catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err || "iap_reconcile_failed"));
            void crashReporting.logError(error, { source: "reconcileOwnedCoinPurchases.foreground" });
          });
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Stop Sound *library* preview only when leaving /music.
  // Never stop on every route (that was nuking For You soundtrack audio → music "started again").
  useEffect(() => {
    if (!location.pathname.startsWith("/music")) {
      useSoundLibraryPlayerStore.getState().stop();
    }
  }, [location.pathname]);

  useEffect(() => {
    const stopLibraryOnHide = () => {
      if (document.visibilityState === "hidden") {
        useSoundLibraryPlayerStore.getState().stop();
      }
    };
    const stopLibraryOnPageHide = () => {
      useSoundLibraryPlayerStore.getState().stop();
    };
    document.addEventListener("visibilitychange", stopLibraryOnHide);
    window.addEventListener("pagehide", stopLibraryOnPageHide);
    return () => {
      document.removeEventListener("visibilitychange", stopLibraryOnHide);
      window.removeEventListener("pagehide", stopLibraryOnPageHide);
    };
  }, []);

  // Back button handled by useDeepLinks hook in deepLinks.ts

  // Realtime DM/cohost via Node/WebSocket backend.

  const isFeedWithTopBar =
    location.pathname === "/" ||
    location.pathname === "/feed";

  const isFeedNoTopBar =
    location.pathname === "/stem" ||
    location.pathname === "/following" ||
    location.pathname === "/friends";

  const isFeedFullScreen = isFeedWithTopBar || isFeedNoTopBar;

  const isFullScreen =
    isFeedFullScreen ||
    location.pathname.startsWith("/video/");

  const isNavHidden =
    location.pathname === "/live" ||
    location.pathname.startsWith("/live/") ||
    location.pathname.startsWith("/watch/") ||
    location.pathname === "/create" ||
    location.pathname.startsWith("/create/") ||
    location.pathname === "/upload" ||
    location.pathname === "/ai-studio" ||
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    // Active DM thread — full chat chrome, no tab bar under the composer
    /^\/inbox\/[^/]+$/.test(location.pathname) ||
    location.pathname === "/call" ||
    location.pathname.startsWith("/call/");
  const showBottomNav = isAuthenticated && !isNavHidden;

  // Public routes that don't require authentication
  const isPublicRoute =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/auth/callback" ||
    location.pathname === "/terms" ||
    location.pathname === "/privacy" ||
    location.pathname === "/copyright" ||
    location.pathname === "/legal" ||
    location.pathname.startsWith("/legal/") ||
    location.pathname === "/guidelines" ||
    location.pathname === "/how-it-works" ||
    location.pathname === "/support" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password";

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
      </div>
    );
  }

  // Redirect to login if not authenticated and trying to access protected route
  if (!isAuthenticated && !isPublicRoute) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // If authenticated and on login/register, redirect to feed
  if (
    isAuthenticated &&
    (location.pathname === "/login" || location.pathname === "/register")
  ) {
    return <Navigate to="/feed" replace />;
  }

  return (
    <div
      className={cn(
        "elix-app-shell fixed inset-0 w-full h-[100dvh] flex flex-col text-text font-sans overflow-hidden",
        (location.pathname === "/feed" || location.pathname === "/") && "elix-feed-chrome-shell",
      )}
    >
      <OfflineBanner />
      <IncomingCallModal />
      <LiveNotifyBanner />
      {/* Swipe from left edge to go back on any page */}
      <div
        className="fixed left-0 top-0 bottom-0 z-[9998]"
        style={{ width: EDGE_SWIPE_WIDTH }}
        onTouchStart={handleEdgeTouchStart}
        onTouchEnd={handleEdgeTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
        aria-hidden
      />
      <TopNav />
      <main
        className={cn(
          "flex-1 feed-column-width self-center min-h-0 overflow-auto",
          showBottomNav && !isFullScreen && "pt-topbar pb-[var(--bottom-ui-reserve)]",
          /* Browser/feed: video under transparent chrome (shell stays clear) */
          showBottomNav && isFeedWithTopBar && "pt-0 pb-0",
          showBottomNav && isFeedNoTopBar && "pt-0 pb-0",
          showBottomNav && isFullScreen && !isFeedFullScreen && "pt-[3mm]",
          !showBottomNav && "pt-[3mm]",
        )}
      >
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route
                path="/"
                element={
                  <Navigate to={isAuthenticated ? "/feed" : "/login"} replace />
                }
              />

              {/* PUBLIC ROUTES (no auth needed) */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/copyright" element={<Copyright />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/legal/audio" element={<LegalAudio />} />
              <Route path="/legal/ugc" element={<LegalUGC />} />
              <Route path="/legal/affiliate" element={<LegalAffiliate />} />
              <Route path="/legal/dmca" element={<LegalDMCA />} />
              <Route path="/legal/safety" element={<LegalSafety />} />
              <Route path="/legal/supplier" element={<LegalSupplier />} />
              <Route path="/guidelines" element={<Guidelines />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/support" element={<Support />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* PROTECTED ROUTES (require auth) */}
              <Route element={<RequireAuth />}>
                <Route path="/feed" element={<VideoFeed />} />
                <Route path="/stem" element={<StemFeed />} />
                <Route path="/following" element={<FollowingFeed />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/rising-stars" element={<RisingStars />} />
                <Route path="/rising-stars/challenge/:challengeId" element={<RisingStarsChallenge />} />
                <Route path="/engagement" element={<EngagementHub />} />
                <Route path="/engagement/missions" element={<EngagementMissions />} />
                <Route path="/engagement/fan-level" element={<EngagementFanLevel />} />
                <Route path="/engagement/mvp" element={<EngagementMvp />} />
                <Route path="/engagement/achievements" element={<EngagementAchievements />} />
                <Route path="/engagement/rewards" element={<EngagementRewards />} />
                <Route path="/engagement/daily-login" element={<EngagementDailyLogin />} />
                <Route path="/engagement/collections" element={<EngagementCollections />} />
                <Route path="/hashtag/:tag" element={<Hashtag />} />
                <Route path="/report" element={<Report />} />
                <Route path="/video/:videoId" element={<VideoView />} />
                <Route path="/live" element={<LiveDiscover />} />
                <Route path="/live/:streamId" element={<LiveStreamGuard />} />
                <Route
                  path="/live/start"
                  element={<Navigate to="/live" replace />}
                />
                <Route path="/live/broadcast" element={<LiveStreamKeyed />} />
                {/* Legacy redirect — handled inline because Navigate can't substitute params */}
                <Route
                  path="/live/watch/:streamId"
                  element={<LiveWatchRedirect />}
                />
                <Route path="/watch/:streamId" element={<SpectatorLiveShell />}>
                  <Route path="profile/:userId" element={<ProfileLiveOverlay />} />
                </Route>
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:userId" element={<Profile />} />
                <Route path="/friends" element={<FriendsFeed />} />
                {/* Standalone saved page; Profile has inline Saved tab. Consider linking from Profile or check 404s before removing. */}
                <Route path="/saved" element={<SavedVideos />} />
                <Route path="/music" element={<MusicFeed />} />
                <Route path="/music/:songId" element={<MusicFeed />} />
                <Route path="/create" element={<Create />} />
                <Route
                  path="/creator/login-details"
                  element={<CreatorLoginDetails />}
                />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/inbox/:threadId" element={<ChatThread />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/edit-profile" element={<EditProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/payout" element={<CreatorPayout />} />
                <Route path="/settings/blocked" element={<BlockedAccounts />} />
                <Route path="/settings/safety" element={<SafetyCenter />} />
                <Route path="/settings/security" element={<SecuritySettings />} />
                <Route
                  path="/settings/notifications"
                  element={<NotificationSettings />}
                />
                <Route path="/profile/:userId/followers" element={<FollowList />} />
                <Route path="/profile/:userId/following" element={<FollowList />} />
                <Route path="/purchase-coins" element={<PurchaseCoins />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:itemId" element={<Shop />} />
                <Route path="/call" element={<VideoCall />} />
                <Route path="/ai-studio" element={<AIStudio />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/admin/reports" element={<AdminReports />} />
                  <Route path="/admin/economy" element={<AdminEconomy />} />
                  <Route path="/admin/monetisation" element={<AdminMonetisation />} />
                  <Route path="/admin/purchases" element={<AdminPurchases />} />
                  <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
                  <Route path="/admin/rising-stars" element={<AdminRisingStars />} />
                  <Route path="/admin/progression" element={<AdminProgression />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/feed" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  );
}

export default App;
