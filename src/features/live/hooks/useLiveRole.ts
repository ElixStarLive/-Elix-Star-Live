/**
 * Resolves Live page role from route — creators only on LiveStream shell.
 */

import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../../store/useAuthStore';

export function useLiveRole() {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const isBroadcast = Boolean(
    streamId === 'broadcast' ||
      location.pathname === '/live/broadcast' ||
      (user?.id && streamId === user.id),
  );

  const isBattleJoiner =
    !isBroadcast && new URLSearchParams(location.search).get('battle') === '1';

  const isCreatorParticipant = Boolean(isBroadcast || isBattleJoiner);

  const effectiveStreamId = useMemo(() => {
    if (isBroadcast && user?.id) return user.id;
    return streamId || '';
  }, [isBroadcast, user?.id, streamId]);

  useEffect(() => {
    if (
      !isCreatorParticipant &&
      streamId &&
      streamId !== 'broadcast' &&
      streamId !== 'start' &&
      streamId !== 'watch'
    ) {
      navigate(`/watch/${streamId}`, { replace: true });
    }
  }, [isCreatorParticipant, streamId, navigate]);

  return {
    streamId: streamId || '',
    effectiveStreamId,
    isBroadcast,
    isBattleJoiner,
    isCreatorParticipant,
    userId: user?.id || '',
    location,
    navigate,
  };
}
