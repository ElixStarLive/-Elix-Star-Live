/**
 * Shared GET-before-POST daily membership heart send (host UI + spectator controller).
 */

import { reportFailure } from '../../../lib/reportFailure';
import { apiLiveGetDailyHearts, apiLiveSendDailyHeart } from '../engagement/liveEngagementApi';

type SendLiveDailyMembershipHeartOutcome =
  | { status: 'already_sent' }
  | { status: 'failed'; message: string }
  | { status: 'ok'; already: boolean };

const FAIL_TOAST = 'Could not send membership heart. Try again.';

export async function sendLiveDailyMembershipHeart(
  creatorId: string,
): Promise<SendLiveDailyMembershipHeartOutcome> {
  try {
    const { data: before } = await apiLiveGetDailyHearts(creatorId);
    if (before?.hasSent) return { status: 'already_sent' };
  } catch (err) {
    reportFailure('live_daily_hearts', err, { creatorId });
  }

  try {
    const { data: d, error } = await apiLiveSendDailyHeart(creatorId);
    if (error) return { status: 'failed', message: FAIL_TOAST };
    const already = d?.already === true;
    if (!(d?.ok === true || already)) {
      return { status: 'failed', message: FAIL_TOAST };
    }
    return { status: 'ok', already };
  } catch (err) {
    reportFailure('live_daily_hearts', err, { creatorId });
    return { status: 'failed', message: FAIL_TOAST };
  }
}
