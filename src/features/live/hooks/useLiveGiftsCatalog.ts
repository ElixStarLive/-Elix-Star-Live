/** Gift catalog for Live gift panel / overlays. */

import { useEffect, useRef, useState } from 'react';
import { fetchGiftsFromDatabase, type GiftUiItem } from '../../../lib/giftsCatalog';

export function useLiveGiftsCatalog() {
  const [giftsCatalog, setGiftsCatalog] = useState<GiftUiItem[]>([]);
  const giftsCatalogRef = useRef<GiftUiItem[]>([]);

  useEffect(() => {
    giftsCatalogRef.current = giftsCatalog;
  }, [giftsCatalog]);

  useEffect(() => {
    let cancelled = false;
    fetchGiftsFromDatabase()
      .then((g) => {
        if (!cancelled) setGiftsCatalog(g);
      })
      .catch(() => {
        /* keep previous catalog — never treat failure as empty success */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { giftsCatalog, giftsCatalogRef, setGiftsCatalog };
}
