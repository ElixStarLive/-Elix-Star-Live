/**
 * Shared host↔spectator gift_sent transaction gate (seen + video-played).
 */

type LiveGiftSentTxnGate = {
  alreadySeen: boolean;
  /** True when this txn's video already played — skip entire handler. */
  shouldSkip: boolean;
};

export function beginLiveGiftSentTxnGate(opts: {
  txnId: string;
  hasSeenGiftTxn: (txnId: string) => boolean;
  hasPlayedGiftVideoTxn: (txnId: string) => boolean;
  markGiftTxnSeen: (txnId: string) => void;
}): LiveGiftSentTxnGate {
  const { txnId, hasSeenGiftTxn, hasPlayedGiftVideoTxn, markGiftTxnSeen } = opts;
  const alreadySeen = hasSeenGiftTxn(txnId);
  const videoAlreadyPlayed = hasPlayedGiftVideoTxn(txnId);
  if (alreadySeen && videoAlreadyPlayed) {
    return { alreadySeen: true, shouldSkip: true };
  }
  if (txnId && !alreadySeen) {
    markGiftTxnSeen(txnId);
  }
  return { alreadySeen, shouldSkip: false };
}
