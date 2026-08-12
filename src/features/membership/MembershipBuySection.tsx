import React from 'react';
import { Heart } from 'lucide-react';
import { MEMBERSHIP_DISPLAY_PRICE } from './membershipPurchaseFlow';

/**
 * Buy block for Team Status / Join Membership panel.
 * Always visible — never hide the purchase action.
 * Matches existing Super Fan membership card styling — not a redesign.
 * Price display matches configured £9 product (store charges real IAP price).
 */
export function MembershipBuySection(props: {
  creatorName: string;
  creatorAvatar?: string;
  isMember: boolean;
  isSubscribing: boolean;
  /** Creator viewing own panel — show block but block self-purchase. */
  isSelf?: boolean;
  onBuy: () => void;
}) {
  const { creatorName, creatorAvatar, isMember, isSubscribing, onBuy } = props;
  const buyDisabled = Boolean(isSubscribing || isMember);

  return (
    <div className="bg-gradient-to-r from-[#D8D9DD]/10 to-[#E6E9EE]/5 rounded-xl p-3 border border-[#D8D9DD]/20 relative overflow-hidden mt-3">
      <div className="relative z-10">
        <div className="flex items-center gap-2.5 mb-2">
          {creatorAvatar ? (
            <img
              src={creatorAvatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover border border-[#D8D9DD]/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-[#D8D9DD]/30">
              <span className="text-[#F5F5F7] text-[10px] font-bold">
                {(creatorName || 'C').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-gold-metallic font-bold text-xs truncate">
              Join {creatorName || 'Creator'}
            </h3>
            <p className="text-white/50 text-[9px]">Unlock photo stickers & exclusive perks</p>
          </div>
          <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center border border-[#D8D9DD]/30 shrink-0">
            <Heart className="w-2.5 h-2.5 text-[#F5F5F7] fill-[#FFFFFF] animate-pulse" />
          </div>
        </div>
        <div className="flex items-end gap-1 mb-2">
          <span className="text-lg font-black text-gold-metallic">{MEMBERSHIP_DISPLAY_PRICE}</span>
          <span className="text-white/40 text-[10px] font-medium mb-0.5">/ month</span>
        </div>
        <button
          type="button"
          onClick={onBuy}
          disabled={buyDisabled}
          className="w-full py-2 bg-gradient-to-r from-[#D8D9DD] to-[#D8D9DD] text-black font-bold text-[10px] uppercase tracking-wide rounded-xl active:scale-[0.98] transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isSubscribing ? (
            <>
              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : isMember ? (
            <span>Membership Active</span>
          ) : (
            <span>Buy Membership</span>
          )}
        </button>
        <p className="text-[8px] text-white/30 text-center mt-1.5">
          Non-refundable. Cancel anytime in store settings.
        </p>
      </div>
    </div>
  );
}
