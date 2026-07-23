import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Video,
  Radio,
  Swords,
  Gift,
  Users,
  Star,
  Crown,
  Shield,
  Heart,
  Clapperboard,
} from 'lucide-react';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

/**
 * In-app product guide — explains how Elix Star Live works for creators and fans.
 * Linked from Settings → How the app works.
 */
export default function HowItWorks() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] text-white flex flex-col">
        <header className="flex items-center justify-center mb-3 px-4 pt-2">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#D4AF37]" />
            How the app works
          </h1>
        </header>
        <div className="overflow-y-auto min-h-0 px-4 pb-4">
          <p className="text-xs text-white/40 italic mb-4">
            Full guide for fans and creators. Last updated: July 24, 2026
          </p>
          <div className="text-sm text-white/75 space-y-5 leading-6">
            <p>
              Elix Star Live is a short-video and live streaming app. Watch the For You feed, go LIVE,
              battle other creators, send gifts, and grow through the Engagement Hub — without mixing
              fake test coins into real money.
            </p>

            <Section icon={<Clapperboard className="w-5 h-5" />} title="Main tabs">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-white/90">Home / For You</strong> — scroll videos. Tap a creator
                  to open their profile. Like, comment, save, share, and duet from the side controls.
                </li>
                <li>
                  <strong className="text-white/90">Friends</strong> — people you follow and friend activity,
                  including stories when available.
                </li>
                <li>
                  <strong className="text-white/90">Create (+)</strong> — open the camera to record a clip,
                  add sound, filters, then post or share as a story.
                </li>
                <li>
                  <strong className="text-white/90">Inbox</strong> — messages, activity, and invite alerts.
                </li>
                <li>
                  <strong className="text-white/90">Profile</strong> — your videos, likes, followers, settings,
                  shop entry points, and creator tools.
                </li>
                <li>
                  <strong className="text-white/90">Live Discover</strong> — browse who is live now and tap
                  to join as a spectator.
                </li>
              </ul>
            </Section>

            <Section icon={<Video className="w-5 h-5" />} title="Videos, sound & duets">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Record or upload a clip from Create / Upload. Add a caption and hashtags before you post.
                </li>
                <li>
                  <strong className="text-white/90">Add sound</strong> — open Add sound, tap Play to preview
                  a licensed track, then Use to attach it. Original Sound keeps your mic audio. No audio
                  posts without sound.
                </li>
                <li>
                  <strong className="text-white/90">Duet</strong> — from a video, start a duet. Choose{' '}
                  <em>Split</em> (half and half) or <em>On top</em> (full original with your face over it),
                  then record and post.
                </li>
                <li>Mute all sounds anytime in Settings if you want a silent feed.</li>
              </ul>
            </Section>

            <Section icon={<Radio className="w-5 h-5" />} title="Going LIVE & watching">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-white/90">Start LIVE</strong> from Create / Live. Viewers join from
                  Live Discover or your share link.
                </li>
                <li>
                  Spectators can chat, like, send gifts, follow, open ranking capsules, and join engagement
                  activities while the stream runs.
                </li>
                <li>
                  <strong className="text-white/90">Co-host</strong> — invite a spectator from Join requests &amp;
                  Spectators, or accept when someone requests to join. Accept / Reject live in that panel
                  (not a separate popup).
                </li>
                <li>
                  <strong className="text-white/90">Poll</strong> — creators can run a live poll; viewers vote
                  from the live controls.
                </li>
                <li>
                  <strong className="text-white/90">Share</strong> — invite friends into the room from the
                  share panel.
                </li>
              </ul>
            </Section>

            <Section icon={<Swords className="w-5 h-5" />} title="Battles (PK)">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Creators invite another live creator into a timed battle. Scores rise from gifts and
                  allowed battle taps.
                </li>
                <li>
                  The red / blue bar shows team scores. Tap the bar to hide it so you can focus on the
                  battle video and chat; tap the VS timer to show scores again.
                </li>
                <li>
                  Empty opponent slots show Add creator / invite. When someone joins, both cameras appear
                  side by side (or 4-player when more join).
                </li>
                <li>
                  <strong className="text-white/90">Battle Energy</strong> boosts battle play — it never
                  creates Diamonds or real money.
                </li>
              </ul>
            </Section>

            <Section icon={<Gift className="w-5 h-5" />} title="Gifts, coins & shop">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-white/90">Coins (in the app)</strong> — buy with Google Play / Apple
                  in-app purchase on mobile. Used for gifts and in-app digital spend.
                </li>
                <li>
                  <strong className="text-white/90">Shop</strong> — physical / shop checkout uses Stripe on
                  web-style shop flows only. Shop is separate from in-app coin IAP.
                </li>
                <li>
                  <strong className="text-white/90">Test coins</strong> (if shown in non-store builds) are fake
                  and only for testing gift UI — never real balance or revenue.
                </li>
                <li>Creators can set up payout from Settings → Creator payout when eligible.</li>
              </ul>
            </Section>

            <Section icon={<Star className="w-5 h-5" />} title="Engagement Hub">
              <p className="mb-2">
                Open Engagement Hub from Settings or live engagement entry points. Battle continues behind
                the panel when you open it from LIVE.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-white/90">Daily / Weekly Missions</strong> — complete goals and claim
                  rewards (Goals &amp; claims).
                </li>
                <li>
                  <strong className="text-white/90">Treasure Hunt</strong> — find hidden chests for engagement
                  rewards.
                </li>
                <li>
                  <strong className="text-white/90">Sticker Collection</strong> — complete sticker sets.
                </li>
                <li>
                  <strong className="text-white/90">Creator Collections</strong> — collectible creator cards.
                </li>
                <li>
                  <strong className="text-white/90">Fan Level</strong> — earn XP and climb fan tiers (e.g. Bronze
                  Fan).
                </li>
                <li>
                  <strong className="text-white/90">MVP Leaderboard</strong> — LIVE / Today / Week top supporters.
                </li>
                <li>
                  <strong className="text-white/90">Battle Energy</strong> — boost Fan Energy for battles; not
                  Diamonds.
                </li>
                <li>
                  <strong className="text-white/90">Achievements</strong> — permanent unlocks for milestones.
                </li>
                <li>
                  <strong className="text-white/90">Daily Login</strong> — 7-day streak rewards.
                </li>
                <li>
                  <strong className="text-white/90">Reward Wallet</strong> — separated balances (promo, energy,
                  XP, purchased) so they stay clear and do not mix with real cash incorrectly.
                </li>
              </ul>
              <p className="mt-2 text-white/55 text-xs">
                Hub stats (Promo, Energy, XP, Fan Level) update as you watch, gift, complete missions, and
                claim daily login.
              </p>
            </Section>

            <Section icon={<Crown className="w-5 h-5" />} title="Ranking & membership">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Live capsules such as <strong className="text-white/90">Diamond League</strong>,{' '}
                  <strong className="text-white/90">Weekly Ranking</strong>, and{' '}
                  <strong className="text-white/90">Membership VIP</strong> open ranking or membership panels
                  from the live header.
                </li>
                <li>
                  <strong className="text-white/90">Rising Stars</strong> — challenges and creator spotlight
                  programs when available from Discover / Rising Stars.
                </li>
                <li>
                  <strong className="text-white/90">+ Join / Follow</strong> on a live — follow the host so you
                  see them again in Friends / Following.
                </li>
              </ul>
            </Section>

            <Section icon={<Users className="w-5 h-5" />} title="Social & inbox">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Follow creators, open follower / following lists from profiles.</li>
                <li>Chat in Inbox threads; battle and co-host invites appear as actionable alerts.</li>
                <li>Block accounts from Settings → Blocked accounts. Report abuse from video / live menus.</li>
              </ul>
            </Section>

            <Section icon={<Shield className="w-5 h-5" />} title="Safety & account">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Read Community Guidelines, Terms, and Privacy from Settings.</li>
                <li>Safety Center covers blocking, reporting, and community rules.</li>
                <li>Security settings manage password / account security.</li>
                <li>Help &amp; Support answers common questions and contact paths.</li>
                <li>You can log out or delete your account from Settings.</li>
              </ul>
            </Section>

            <Section icon={<Heart className="w-5 h-5" />} title="Quick tips">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Always preview a song with Play before Use if you want to hear it first.</li>
                <li>During battle, hide the score bar when you want more chat space.</li>
                <li>Engagement rewards are digital (XP, energy, promo) — not cash withdrawals unless you use
                  official creator payout where eligible.</li>
                <li>If something fails to load, pull to refresh Live Discover or reopen the room.</li>
              </ul>
            </Section>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate('/engagement')}
                className="w-full py-3 bg-[#D4AF37] text-black rounded-xl font-bold active:opacity-90 transition"
              >
                Open Engagement Hub
              </button>
              <button
                type="button"
                onClick={() => navigate('/support')}
                className="w-full py-3 bg-white/10 text-white rounded-xl font-semibold active:bg-white/15 transition"
              >
                Help &amp; Support
              </button>
              <button
                type="button"
                onClick={() => navigate('/guidelines')}
                className="w-full py-3 bg-white/10 text-white rounded-xl font-semibold active:bg-white/15 transition"
              >
                Community Guidelines
              </button>
            </div>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-white font-semibold text-base mb-2">
        <span className="text-[#D4AF37] flex-shrink-0">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}
