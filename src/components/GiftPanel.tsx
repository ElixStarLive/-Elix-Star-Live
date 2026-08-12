import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { Coins, CloudFog } from "lucide-react";
import { BuyCoinsModal } from "./BuyCoinsModal";
import { GiftItem, fetchGiftsFromDatabase, resolveGiftAssetUrl } from "../lib/giftsCatalog";
import { showToast } from "../lib/toast";
import { reportFailure } from "../lib/reportFailure";
import { GloveIcon } from "./BattleVfxOverlays";

interface GiftPanelBattleBoost {
  boosterActive: boolean;
  /** Last / active multiplier badge (x2 / x3 / x5). */
  boosterMultiplier?: number | null;
  mistActive: boolean;
  /** One tap — system picks x2/x3/x5 (no Left/Right / no manual tier). */
  onBooster: () => void;
  onMist: () => void;
}

interface GiftPanelProps {
  onSelectGift: (gift: GiftItem) => void;
  /** Paid coin balance only. */
  userCoins: number;
  starterCoins?: number;
  promotionalCoins?: number;
  giftSource?: "starter_coins" | "paid_coins" | "promotional_coins";
  onGiftSourceChange?: (
    source: "starter_coins" | "paid_coins" | "promotional_coins",
  ) => void;
  onRechargeSuccess?: (newBalance: number) => void;
  /** Battle: buster + fog icons in the old Weekly Ranking / Membership slots. */
  battleBoost?: GiftPanelBattleBoost | null;
  /** Highlights the creator's gift goal in the grid */
  highlightGiftId?: string | null;
}

/* ------------------------------------------------------------------ */
/*  GiftGridItem – PNG icon only; video plays on stream after send    */
/* ------------------------------------------------------------------ */
const GIFT_CDN_ORIGIN = "https://elixstorage.b-cdn.net";

function giftIconCdnFallback(src: string): string | null {
  if (!src || src.startsWith("data:") || src.includes("elixstorage.b-cdn.net")) {
    return null;
  }
  try {
    let path = src;
    if (src.startsWith("http")) {
      const host = new URL(src).hostname;
      if (host.includes("storage.bunnycdn.com") || host.includes("elixstarlive")) {
        path = new URL(src).pathname;
      } else {
        return null;
      }
    }
    if (!path.includes("/gifts/")) return null;
    const rel = path.replace(/^\/+/, "");
    return `${GIFT_CDN_ORIGIN}/${rel}`;
  } catch {
    return null;
  }
}

interface GiftGridItemProps {
  gift: GiftItem;
  pngUrl: string;
  isSelected: boolean;
  onTap: () => void;
  borderClass?: string;
}

function GiftGridItem({
  gift,
  pngUrl,
  isSelected: _isSelected,
  onTap,
  borderClass,
}: GiftGridItemProps) {
  const [imgError, setImgError] = useState(false);
  const [iconSrc, setIconSrc] = useState(() => resolveGiftAssetUrl(pngUrl || gift.icon));

  useEffect(() => {
    setIconSrc(resolveGiftAssetUrl(pngUrl || gift.icon));
    setImgError(false);
  }, [pngUrl, gift.icon]);

  const displayIcon = imgError
    ? "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a2a2a"/><text x="32" y="38" text-anchor="middle" fill="#666" font-size="10" font-family="sans-serif">?</text></svg>')
    : pngUrl;

  return (
    <button
      type="button"
      onClick={onTap}
      className={[
        "group flex flex-col items-center justify-start gap-1 p-1 rounded-xl bg-transparent border relative min-w-0 w-full h-full",
        borderClass ?? "border-transparent",
      ].join(" ")}
    >
      {/* Fixed square icon slot — keeps every gift on the same row baseline */}
      <div className="w-full aspect-square flex-shrink-0 overflow-hidden flex items-center justify-center bg-transparent relative">
        <img
          src={imgError ? displayIcon : iconSrc}
          alt={gift.name}
          className="max-w-full max-h-full w-full h-full object-contain object-center pointer-events-none bg-transparent"
          draggable={false}
          onError={() => {
            const fallback = giftIconCdnFallback(iconSrc);
            if (fallback && fallback !== iconSrc) {
              setIconSrc(fallback);
              return;
            }
            setImgError(true);
          }}
        />
      </div>

      <div className="w-full min-w-0 flex-shrink-0 text-center z-10 h-[2.4rem] flex flex-col items-center justify-start overflow-hidden">
        <p className="text-[10px] text-white/90 font-medium truncate w-full leading-tight px-0.5">
          {gift.name}
        </p>
        <div className="flex items-center justify-center gap-1 bg-transparent mt-0.5">
          <Coins size={9} className="text-[#D9A62E] flex-shrink-0" fill="none" strokeWidth={2} />
          <p className="text-[10px] text-[#D9A62E] font-bold tabular-nums leading-none">
            {gift.coins.toLocaleString()}
          </p>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main GiftPanel                                                     */
/* ------------------------------------------------------------------ */
export function GiftPanel({
  onSelectGift,
  userCoins,
  starterCoins = 0,
  promotionalCoins = 0,
  giftSource = "paid_coins",
  onGiftSourceChange,
  onRechargeSuccess,
  battleBoost = null,
  highlightGiftId = null,
}: GiftPanelProps) {
  const userCoinsRef = useRef(userCoins);
  userCoinsRef.current = userCoins;

  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [activeTab, setActiveTab] = useState<"exclusive" | "small" | "big">(
    "big",
  );
  const [showRecharge, setShowRecharge] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGiftsFromDatabase().then((items) => {
      if (!cancelled) setGifts(items);
    }).catch((err) => {
      if (!cancelled) {
        reportFailure('gift_panel_catalog', err);
        showToast(err instanceof Error ? err.message : 'Failed to load gifts');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const universeGifts = useMemo(
    () => gifts.filter((g) => g.giftType === "universe"),
    [gifts],
  );
  const bigGifts = useMemo(() => gifts.filter((g) => g.giftType === "big"), [gifts]);
  const smallGifts = useMemo(
    () => gifts.filter((g) => g.giftType === "small"),
    [gifts],
  );

  const posterByGiftId = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const g of gifts) {
      map.set(g.id, g.icon);
    }
    return map;
  }, [gifts]);

  useEffect(() => {
    if (!highlightGiftId || gifts.length === 0) return;
    const match = gifts.find((g) => g.id === highlightGiftId);
    if (!match) return;
    setActiveTab(
      match.giftType === "small"
        ? "small"
        : match.giftType === "universe"
          ? "exclusive"
          : "big",
    );
  }, [highlightGiftId, gifts]);

  const goalBorder = (_giftId: string, _fallback?: string) =>
    undefined;

  const handleGiftTap = useCallback(
    (gift: GiftItem) => {
      onSelectGift(gift);
    },
    [onSelectGift],
  );

  return (
    <>
    {/* Hide gift sheet entirely while Top Up is open — do not change gift assets */}
    <div
      ref={panelRef}
      className={`elix-panel elix-gift-sheet rounded-t-2xl p-3 pb-safe max-h-[40dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y no-scrollbar shadow-2xl w-full relative z-[99999] ${
        showRecharge ? "hidden" : ""
      }`}
      style={{ touchAction: "pan-y" }}
      onTouchMove={(e) => {
        // Keep gift panel vertical-only; do not let horizontal pans move the live page.
        e.stopPropagation();
      }}
      aria-hidden={showRecharge || undefined}
    >
      {/* Header — decoration line, then Send Gift name under it (same as Ranking / More) */}
      <div className="flex flex-col px-1 pt-0 pb-2 border-b border-[#D8D9DD]/45 mb-2 flex-shrink-0">
        <div className="flex justify-center pb-2" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <h3 className="text-[#F5F5F7] font-bold text-sm text-center">Send Gift</h3>
      </div>

      {/* Capsules under title: battle buster + fog (left) — gift coins + Top Up (right) */}
      <div
        className="mb-3 -mx-3 w-[calc(100%+24px)] overflow-hidden"
        style={{ height: "10mm", maxHeight: "10mm" }}
      >
        <div className="w-full h-full flex items-center justify-between gap-1.5 px-3">
          <div className="flex items-center gap-1.5 flex-nowrap min-w-0 overflow-x-auto no-scrollbar">
            {battleBoost ? (
              <>
                <button
                  type="button"
                  title="Buster — system picks x2 / x3 / x5"
                  disabled={battleBoost.boosterActive}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (battleBoost.boosterActive) return;
                    battleBoost.onBooster();
                  }}
                  className={`relative flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full border transition-colors active:scale-90 ${
                    battleBoost.boosterActive
                      ? "bg-[#E6E9EE] border-[#D8D9DD] text-white elix-accent"
                      : "bg-transparent border-[#D8D9DD]/40 text-[#F5F5F7]"
                  }`}
                >
                  <GloveIcon className="w-3.5 h-3.5" />
                  <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-black leading-none px-0.5 rounded-full bg-black text-[#F5F5F7] border border-[#D8D9DD]/60">
                    {battleBoost.boosterMultiplier && battleBoost.boosterMultiplier > 1
                      ? `x${battleBoost.boosterMultiplier}`
                      : "auto"}
                  </span>
                </button>
                <button
                  type="button"
                  title="Mist fog — hide score from the other side"
                  disabled={battleBoost.mistActive}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (battleBoost.mistActive) return;
                    battleBoost.onMist();
                  }}
                  className={`flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full border transition-colors active:scale-90 ${
                    battleBoost.mistActive
                      ? "bg-[#E6E9EE] border-[#D8D9DD] text-white elix-accent"
                      : "bg-transparent border-[#D8D9DD]/40 text-[#F5F5F7]"
                  }`}
                >
                  <CloudFog className="w-3.5 h-3.5" strokeWidth={2.25} />
                </button>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-1 rounded-full px-1.5 py-0.5 border border-[#D8D9DD]/40 bg-transparent">
              {onGiftSourceChange && promotionalCoins > 0 && (
                <button
                  type="button"
                  onClick={() => onGiftSourceChange("promotional_coins")}
                  className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                    giftSource === "promotional_coins"
                      ? "bg-[#C9CCD1] text-black"
                      : "text-white/60"
                  }`}
                  title="Promotional coins; zero Diamonds / creator earnings"
                >
                  Promo {promotionalCoins.toLocaleString()}
                </button>
              )}
              {onGiftSourceChange && starterCoins > 0 && (
                <button
                  type="button"
                  onClick={() => onGiftSourceChange("starter_coins")}
                  className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                    giftSource === "starter_coins"
                      ? "bg-white text-black"
                      : "text-white/60"
                  }`}
                  title="Free onboarding coins; no monetary value or creator earnings"
                >
                  Starter {starterCoins.toLocaleString()}
                </button>
              )}
              <button
                type="button"
                onClick={() => onGiftSourceChange?.("paid_coins")}
                className={`flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded ${
                  giftSource === "paid_coins" || !onGiftSourceChange
                    ? "text-[#D9A62E]"
                    : "text-[#D9A62E]/70"
                }`}
              >
                <Coins size={10} />
                {userCoins.toLocaleString()}
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowRecharge(true);
              }}
              className="flex items-center gap-1 flex-shrink-0 rounded-full px-2 py-0.5 border border-[#D8D9DD]/40 bg-transparent active:scale-95 transition-transform"
            >
              <Coins className="w-2.5 h-2.5 text-[#F5F5F7] flex-shrink-0" />
              <span className="text-[#F5F5F7] text-[8px] font-bold whitespace-nowrap">
                Top Up
              </span>
            </button>
          </div>
        </div>
      </div>
      {giftSource === "starter_coins" && (
        <p className="text-[9px] text-white/45 -mt-2 mb-2 text-right">
          Starter gifts earn XP but create no creator earnings.
        </p>
      )}
      {giftSource === "promotional_coins" && (
        <p className="text-[9px] text-white/45 -mt-2 mb-2 text-right">
          Promo gifts create zero Diamonds / creator earnings.
        </p>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-2 px-1">
        <button
          className={`text-xs font-medium pb-1.5 transition-colors relative ${
            activeTab === "small"
              ? "text-white"
              : "text-white/50 hover:text-white/80"
          }`}
          onClick={() => setActiveTab("small")}
        >
          Small Gift
          {activeTab === "small" && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-400 rounded-t-full" />
          )}
        </button>
        <button
          className={`text-xs font-medium pb-1.5 transition-colors relative ${
            activeTab === "exclusive"
              ? "text-white"
              : "text-white/50 hover:text-white/80"
          }`}
          onClick={() => setActiveTab("exclusive")}
        >
          Exclusive Gift
          {activeTab === "exclusive" && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-secondary rounded-t-full" />
          )}
        </button>
        <button
          className={`text-sm font-bold pb-2 transition-colors relative ${
            activeTab === "big"
              ? "text-[#A7A7AD]"
              : "text-white/50 hover:text-white/80"
          }`}
          onClick={() => setActiveTab("big")}
        >
          Big Gift
          {activeTab === "big" && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-secondary rounded-t-full" />
          )}
        </button>
      </div>

      {/* ============ Exclusive Tab ============ */}
      {activeTab === "exclusive" && (
        <div className="animate-fade-in">
          {universeGifts.length > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-4 gap-2 items-start">
                {universeGifts.map((gift) => (
                <GiftGridItem
                  key={gift.id}
                  gift={gift}
                  pngUrl={posterByGiftId.get(gift.id) || ""}
                  isSelected={false}
                  onTap={() => handleGiftTap(gift)}
                  borderClass={goalBorder(gift.id)}
                />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ Big Gifts Tab ============ */}
      {activeTab === "big" && (
        <div className="animate-fade-in">
          <div className="grid grid-cols-4 gap-2 items-start">
            {bigGifts.map((gift) => (
              <GiftGridItem
                key={gift.id}
                gift={gift}
                pngUrl={posterByGiftId.get(gift.id) || ""}
                isSelected={false}
                onTap={() => handleGiftTap(gift)}
                borderClass={goalBorder(gift.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ Small Gifts Tab ============ */}
      {activeTab === "small" && smallGifts.length > 0 && (
        <div className="mt-2 animate-fade-in">
          <div className="grid grid-cols-4 gap-2 items-start">
            {smallGifts.map((gift) => (
              <GiftGridItem
                key={gift.id}
                gift={gift}
                pngUrl={gift.icon}
                isSelected={false}
                onTap={() => handleGiftTap(gift)}
                borderClass={goalBorder(gift.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
    <BuyCoinsModal
      isOpen={showRecharge}
      onClose={() => setShowRecharge(false)}
      currentBalance={userCoins}
      onSuccess={(newBalance) => {
        if (onRechargeSuccess) onRechargeSuccess(newBalance);
      }}
    />
    </>
  );
}
