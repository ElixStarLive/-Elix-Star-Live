import React, { useEffect, useState } from "react";
import { Wallet, Zap } from "lucide-react";
import { EngagementShell } from "./EngagementShell";
import { showToast } from "../../lib/toast";
import { engagementFlags } from "../../config/engagementFlags";
import { apiLiveEngagementWallet } from "../../features/live/engagement/liveEngagementApi";

type WalletData = {
  purchasedCoins?: number;
  starterCoins?: number;
  promotionalCoins?: number;
  totalGiftSpendable?: number;
  battleEnergy?: number;
  totalXp?: number;
  fanLevel?: number;
  fanTier?: string;
  purchased_coins?: number;
  promotional_coins?: number;
  battle_energy?: number;
  starter_coins?: number;
  total_xp?: number;
  fan_level?: number;
  fan_tier?: string;
};

export default function EngagementRewards() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await apiLiveEngagementWallet();
        if (error) throw new Error(error);
        setWallet((data?.wallet as WalletData) || null);
      } catch {
        showToast("Could not load reward wallet");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const purchased = wallet?.purchasedCoins ?? wallet?.purchased_coins ?? 0;
  const starter = wallet?.starterCoins ?? wallet?.starter_coins ?? 0;
  const promo = wallet?.promotionalCoins ?? wallet?.promotional_coins ?? 0;
  const energy = wallet?.battleEnergy ?? wallet?.battle_energy ?? 0;
  const xp = wallet?.totalXp ?? wallet?.total_xp ?? 0;
  const level = wallet?.fanLevel ?? wallet?.fan_level ?? 0;
  const tier = wallet?.fanTier ?? wallet?.fan_tier ?? "Bronze Fan";
  const spendable =
    wallet?.totalGiftSpendable ?? purchased + starter + (engagementFlags.promoGiftSpendEnabled ? promo : 0);

  const Row = ({
    label,
    value,
    note,
  }: {
    label: string;
    value: string | number;
    note: string;
  }) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-2">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-sm font-semibold">
          <span className="elix-silver-red-text">{label}</span>
        </span>
        <span className="text-sm font-bold tabular-nums">
          <span className="elix-silver-red-text">{value}</span>
        </span>
      </div>
      <p className="text-[11px]">
        <span className="elix-silver-red-text opacity-55">{note}</span>
      </p>
    </div>
  );

  return (
    <EngagementShell title="Reward Wallet" icon={Wallet}>
      {loading ? (
        <div className="py-10 text-center text-sm">
          <span className="elix-silver-red-text opacity-50">Loading...</span>
        </div>
      ) : (
        <>
          <Row
            label="Available for gifts"
            value={spendable}
            note="Display total only. Server chooses which balance is spent."
          />
          <Row
            label="Purchased Coins"
            value={purchased}
            note="From IAP / real money. Used for gifts. Never mixed with promo."
          />
          <Row
            label="Promotional Coins"
            value={promo}
            note={
              engagementFlags.promotionalCoinsEnabled
                ? "Platform rewards. Not withdrawable. Promo gifts create zero Diamonds."
                : "Promotional coins disabled by config."
            }
          />
          <Row
            label="Starter Coins"
            value={starter}
            note="Onboarding free coins. Separate from purchased and promo."
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-2">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-sm font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 royce-icon-gold" />
                <span className="elix-silver-red-text">Battle Energy</span>
              </span>
              <span className="text-sm font-bold tabular-nums">
                <span className="elix-silver-red-text">{energy}</span>
              </span>
            </div>
            <p className="text-[11px]">
              <span className="elix-silver-red-text opacity-55">
                {engagementFlags.battleEnergyEnabled
                  ? "Free LIVE boost power. Affects battle score only — never Diamonds."
                  : "Battle Energy disabled by config."}
              </span>
            </p>
          </div>
          <Row
            label="XP / Fan Level"
            value={`${xp} XP · Lv ${level}`}
            note={`${tier} — progression only, not currency.`}
          />
          <p className="mt-3 text-[11px] leading-relaxed">
            <span className="elix-silver-red-text opacity-55">
              Test coins stay local for UI testing and never appear here.
            </span>
          </p>
        </>
      )}
    </EngagementShell>
  );
}
