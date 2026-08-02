/** Gift catalog for Live gift panel / overlays. */

import { useEffect, useRef, useState } from 'react';
import { fetchGiftsFromDatabase, type GiftUiItem } from '../../../lib/giftsCatalog';

export function useLiveGiftsCatalog() {
  const [giftsCatalog, setGiftsCatalog] = useState<GiftUiItem[]>([]);
  const giftsCatalogRef = useRef<GiftUiItem[]>([]);
  const seenGiftTxnRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    giftsCatalogRef.current = giftsCatalog;
  }, [giftsCatalog]);

  useEffect(() => {
    let cancelled = false;
    fetchGiftsFromDatabase().then((g) => {
      if (!cancelled) setGiftsCatalog(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { giftsCatalog, giftsCatalogRef, seenGiftTxnRef, setGiftsCatalog };
}
