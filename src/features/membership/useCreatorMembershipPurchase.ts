/**
 * Shared creator membership purchase for Live / Battle / Spectator.
 * Apple IAP + Google Play Billing only — never Stripe.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMembershipStatus } from '../../lib/iap';
import { useAuthStore } from '../../store/useAuthStore';
import { showToast } from '../../lib/toast';
import {
  consumePendingMembershipOpenPanel,
  loginReturnPath,
  peekPendingMembershipCreator,
  purchaseCreatorMembership,
  stashPendingMembershipPurchase,
} from './membershipPurchaseFlow';

export function useCreatorMembershipPurchase(options: {
  creatorId: string;
  onActivated?: () => void;
  onOpenPanel?: () => void;
}) {
  const { creatorId, onActivated, onOpenPanel } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const pendingResumeRef = useRef(false);
  const onActivatedRef = useRef(onActivated);
  const onOpenPanelRef = useRef(onOpenPanel);
  onActivatedRef.current = onActivated;
  onOpenPanelRef.current = onOpenPanel;

  const resolvedCreatorId = String(creatorId || '').trim();
  const isSelf =
    Boolean(user?.id && resolvedCreatorId && resolvedCreatorId !== 'broadcast' && user.id === resolvedCreatorId);

  useEffect(() => {
    if (!user?.id || !resolvedCreatorId || resolvedCreatorId === 'broadcast' || isSelf) {
      setIsMember(false);
      return;
    }
    let cancelled = false;
    void getMembershipStatus(resolvedCreatorId).then(({ status }) => {
      if (!cancelled) setIsMember(status?.active === true);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedCreatorId, user?.id, isSelf]);

  const goLoginForMembership = useCallback(
    (id: string) => {
      stashPendingMembershipPurchase(id);
      navigate('/login', {
        state: { from: loginReturnPath(location.pathname, location.search) },
      });
    },
    [navigate, location.pathname, location.search],
  );

  const handleSubscribe = useCallback(async () => {
    const id = resolvedCreatorId;
    if (!id || id === 'broadcast') {
      showToast('Creator unavailable');
      return;
    }
    if (user?.id && id === user.id) {
      showToast('Viewers can subscribe to your membership.');
      return;
    }
    if (!user?.id || !useAuthStore.getState().session?.access_token) {
      goLoginForMembership(id);
      return;
    }
    setIsSubscribing(true);
    try {
      const result = await purchaseCreatorMembership(id);
      if (!result.ok) {
        if (result.needsLogin) {
          goLoginForMembership(id);
          return;
        }
        if (!result.cancelled) {
          showToast(result.error || 'Membership purchase failed');
        }
        return;
      }
      setIsMember(true);
      showToast(result.alreadyActive ? 'Membership already active' : 'Membership activated!');
      onActivatedRef.current?.();
    } catch {
      showToast('Membership purchase failed');
    } finally {
      setIsSubscribing(false);
    }
  }, [resolvedCreatorId, user?.id, goLoginForMembership]);

  /** After login/register: reopen panel and continue native IAP (no fake success). */
  useEffect(() => {
    if (!user?.id || pendingResumeRef.current) return;
    if (!consumePendingMembershipOpenPanel()) return;
    const pending = peekPendingMembershipCreator();
    if (!pending || pending !== resolvedCreatorId || pending === user.id) return;
    pendingResumeRef.current = true;
    onOpenPanelRef.current?.();
    void (async () => {
      setIsSubscribing(true);
      try {
        const result = await purchaseCreatorMembership(pending);
        if (!result.ok) {
          if (!result.cancelled && !result.needsLogin) {
            showToast(result.error || 'Membership purchase failed');
          }
          return;
        }
        setIsMember(true);
        showToast(result.alreadyActive ? 'Membership already active' : 'Membership activated!');
        onActivatedRef.current?.();
      } catch {
        showToast('Membership purchase failed');
      } finally {
        setIsSubscribing(false);
      }
    })();
  }, [user?.id, resolvedCreatorId]);

  return {
    isMember,
    isSubscribing,
    isSelf,
    handleSubscribe,
    goLoginForMembership,
  };
}
