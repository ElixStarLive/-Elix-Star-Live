import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { Gift, Coins, Trophy, Heart } from "lucide-react";
import { IS_STORE_BUILD } from "@/config/build";
import { BuyCoinsModal } from "./BuyCoinsModal";
import { GiftItem, fetchGiftsFromDatabase } from "../lib/giftsCatalog";

interface GiftPanelProps {
  onSelectGift: (gift: GiftItem) => void;
  userCoins: number;
  onRechargeSuccess?: (newBalance: number) => void;
  onWeeklyRanking?: () => void;
  onMembership?: () => void;
}

function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
    }, options);

    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.root, options?.threshold]);

  return { ref, inView };
}

/* ------------------------------------------------------------------ */
/*  GiftGridItem – shows PNG instantly, video loads behind & plays    */
/*  on hover / active selection                                       */
/* ------------------------------------------------------------------ */
interface GiftGridItemProps {
  gift: GiftItem;
  pngUrl: string;
  isPopped: boolean;
  onSelect: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  borderClass?: string;
}

function GiftGridItem({
  gift,
  pngUrl,
  isPopped,
  onSelect,
  onHoverStart,
  onHoverEnd,
  borderClass,
}: GiftGridItemProps) {
  const [hovered, setHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [imgError, setImgError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Disable hover-preview playback in the gift grid; video plays only when a gift is actually sent.
  const hasVideo = false;

  const displayIcon = imgError
    ? "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a2a2a"/><text x="32" y="38" text-anchor="middle" fill="#666" font-size="10" font-family="sans-serif">?</text></svg>')
    : pngUrl;

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    onHoverStart();
    if (hasVideo && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [hasVideo, onHoverStart]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    onHoverEnd();
    if (hasVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [hasVideo, onHoverEnd]);

  const handleClick = useCallback(() => {
    onSelect();
    // Also briefly play video on tap for mobile
    if (hasVideo && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [hasVideo, onSelect]);

  return (
    <button
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={[
        "group flex flex-col items-center gap-1.5 p-1 rounded-xl hover:brightness-125 border transition-all duration-300 active:scale-95 relative overflow-hidden z-[99999]",
        borderClass ?? "border-transparent hover:border-secondary/30",
      ].join(" ")}
    >
      <div
        className={[
          "w-full aspect-square flex items-center justify-center bg-transparent rounded-2xl shadow-inner group-hover:shadow-secondary/20 transition-all overflow-hidden relative elix-gift-idle border border-transparent",
          isPopped ? "elix-gift-pop" : "",
        ].join(" ")}
      >
        {/* PNG image – always visible; fallback to default icon if CDN image fails (e.g. missing in Bunny) */}
        <img
          src={displayIcon}
          alt={gift.name}
          className="w-full h-full object-contain p-1 pointer-events-none relative z-[2]"
          style={{
            opacity: hovered && videoReady && hasVideo ? 0 : 1,
            transition: "opacity 0.25s ease",
          }}
          draggable={false}
          onError={() => {
            setImgError(true);
          }}
        />

        {/* Video – loads in background, visible only on hover once ready */}
        {hasVideo && (
          <video
            ref={videoRef}
            src={gift.video}
            poster={pngUrl}
            muted
            loop
            playsInline
            preload="none"
            onLoadedData={() => setVideoReady(true)}
            className="absolute inset-0 w-full h-full object-contain p-1 pointer-events-none z-[1]"
            style={{
              opacity: hovered && videoReady ? 1 : 0,
              transition: "opacity 0.25s ease",
            }}
          />
        )}

        {/* Sparkle overlay for small gifts */}
        {gift.giftType === "small" && <div className="elix-gift-sparkle" />}
      </div>

      <div className="text-center z-10">
        <p className="text-[10px] text-white/90 font-medium truncate w-full mb-0.5 group-hover:text-white">
          {gift.name}
        </p>
        <div className="flex items-center justify-center gap-1">
          <Coins size={9} className="text-secondary" />
          <p className="text-[10px] text-secondary font-bold">
            {gift.coins.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="absolute inset-0 bg-secondary/5 opacity-0 group-hover:opacity-100 rounded-xl transition-opacity pointer-events-none" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main GiftPanel                                                     */
/* ------------------------------------------------------------------ */
export function GiftPanel({
  onSelectGift,
  userCoins,
  onRechargeSuccess,
  onWeeklyRanking,
  onMembership,
}: GiftPanelProps) {
  const userCoinsRef = useRef(userCoins);
  userCoinsRef.current = userCoins;

  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [activeTab, setActiveTab] = useState<"exclusive" | "small" | "big">(
    "big",
  );
  const [_activeGiftId, setActiveGiftId] = useState<string | null>(null);
  const [poppedGiftId, setPoppedGiftId] = useState<string | null>(null);
  const [showRecharge, setShowRecharge] = useState(false);
  const { ref: panelRef, inView } = useInView<HTMLDivElement>({
    root: null,
    threshold: 0.05,
  });

  useEffect(() => {
    let cancelled = false;
    fetchGiftsFromDatabase().then((items) => {
      if (!cancelled) setGifts(items);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const universeGift = useMemo(
    () => gifts.find((g) => g.giftType === "universe"),
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
    if (!inView) return;
    const first =
      activeTab === "exclusive" ? (universeGift ?? bigGifts[0]) : smallGifts[0];
    if (!first) return;
    setActiveGiftId((prev) => prev ?? first.id);
  }, [bigGifts, inView, universeGift, smallGifts, activeTab]);

  const handleSelectGift = useCallback(
    (gift: GiftItem) => {
      setPoppedGiftId(gift.id);
      window.setTimeout(
        () => setPoppedGiftId((v) => (v === gift.id ? null : v)),
        520,
      );
      onSelectGift(gift);
    },
    [onSelectGift],
  );

  return (
    <div
      ref={panelRef}
      className="bg-[#1a1a1a]/95 rounded-t-2xl p-3 pb-safe max-h-[40dvh] overflow-y-auto no-scrollbar shadow-2xl w-full relative z-[99999]"
    >
      {/* Top bar: Weekly Ranking / Membership */}
      {(onWeeklyRanking || onMembership) && (
        <div
          className="mb-1.5 -mx-3 -mt-1 w-[calc(100%+24px)] overflow-hidden border-b border-white/5"
          style={{ height: "10mm", maxHeight: "10mm" }}
        >
          <div
            className="w-full h-full flex items-center overflow-x-auto no-scrollbar"
            style={{ scrollBehavior: "smooth" }}
          >
            <div className="flex items-center gap-2 px-3 flex-nowrap min-w-max">
              {onWeeklyRanking && (
                <div
                  className="flex items-center gap-1 cursor-pointer flex-shrink-0 active:scale-95 transition-transform"
                  onClick={onWeeklyRanking}
                >
                  <Trophy className="w-2.5 h-2.5 text-[#C9A96E] flex-shrink-0" />
                  <span className="text-[#C9A96E] text-[8px] font-bold whitespace-nowrap">
                    Weekly Ranking &gt;
                  </span>
                </div>
              )}
              {onWeeklyRanking && onMembership && (
                <span className="text-white/10 text-[8px]">|</span>
              )}
              {onMembership && (
                <div
                  className="flex items-center gap-1 cursor-pointer flex-shrink-0 active:scale-95 transition-transform"
                  onClick={onMembership}
                >
                  <Heart className="w-2.5 h-2.5 text-[#C9A96E] fill-[#C9A96E] flex-shrink-0" />
                  <span className="text-[#C9A96E] text-[8px] font-bold whitespace-nowrap">
                    Membership
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header: title + coin balance */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Gift className="text-yellow-400" size={16} />
          Send Gift
        </h3>
        <div className="flex items-center gap-2 bg-black px-2.5 py-0.5 rounded-full border border-secondary/20">
          <Coins size={13} className="text-secondary" />
          <span className="text-secondary font-bold text-xs">
            {userCoins.toLocaleString()}
          </span>
          {!IS_STORE_BUILD && (
            <button
              onClick={() => setShowRecharge(true)}
              className="bg-secondary text-black text-[9px] font-bold px-1.5 py-0.5 rounded ml-2 hover:bg-white transition"
            >
              Top Up
            </button>
          )}
        </div>
      </div>

      <BuyCoinsModal
        isOpen={showRecharge}
        onClose={() => setShowRecharge(false)}
        onSuccess={(coins) => {
          if (onRechargeSuccess) onRechargeSuccess(userCoinsRef.current + coins);
        }}
      />

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-2 px-1">
        <button
          className={`text-xs font-medium pb-1.5 transition-colors relative ${
            activeTab === "small"
              ? "text-yellow-400"
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
              ? "text-yellow-400"
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
              ? "text-secondary"
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
          {universeGift && (
            <div className="mb-4">
              <div className="grid grid-cols-4 gap-2">
                <GiftGridItem
                  key={universeGift.id}
                  gift={universeGift}
                  pngUrl={posterByGiftId.get(universeGift.id) || ""}
                  isPopped={poppedGiftId === universeGift.id}
                  onSelect={() => handleSelectGift(universeGift)}
                  onHoverStart={() => setActiveGiftId(universeGift.id)}
                  onHoverEnd={() =>
                    setActiveGiftId((v) => (v === universeGift.id ? null : v))
                  }
                  borderClass="border-secondary/30"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ Big Gifts Tab ============ */}
      {activeTab === "big" && (
        <div className="animate-fade-in">
          <div className="grid grid-cols-4 gap-2">
            {bigGifts.map((gift) => (
              <GiftGridItem
                key={gift.id}
                gift={gift}
                pngUrl={posterByGiftId.get(gift.id) || ""}
                isPopped={poppedGiftId === gift.id}
                onSelect={() => handleSelectGift(gift)}
                onHoverStart={() => setActiveGiftId(gift.id)}
                onHoverEnd={() =>
                  setActiveGiftId((v) => (v === gift.id ? null : v))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ Small Gifts Tab ============ */}
      {activeTab === "small" && smallGifts.length > 0 && (
        <div className="mt-2 animate-fade-in">
          <div className="grid grid-cols-4 gap-2">
            {smallGifts.map((gift) => (
              <GiftGridItem
                key={gift.id}
                gift={gift}
                pngUrl={gift.icon}
                isPopped={poppedGiftId === gift.id}
                onSelect={() => handleSelectGift(gift)}
                onHoverStart={() => setActiveGiftId(gift.id)}
                onHoverEnd={() =>
                  setActiveGiftId((v) => (v === gift.id ? null : v))
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
