/**
 * Cache hit/miss counters (per worker) — no dependency on postgres/valkey.
 * Used for staged load tests: hit rates for feed, streams, catalog, profiles list.
 */

const cacheLayer = {
  feed_foryou_valkey_hits: 0,
  feed_foryou_builds: 0,
  live_streams_valkey_hits: 0,
  live_streams_builds: 0,
  gifts_valkey_hits: 0,
  gifts_mem_hits: 0,
  gifts_builds: 0,
  coin_packages_valkey_hits: 0,
  coin_packages_mem_hits: 0,
  coin_packages_builds: 0,
  profiles_list_valkey_hits: 0,
  profiles_list_mem_hits: 0,
  profiles_list_builds: 0,
};

export type CacheLayerStat = keyof typeof cacheLayer;

export function bumpCacheLayer(stat: CacheLayerStat): void {
  cacheLayer[stat]++;
}

function rate(hits: number, builds: number): number | null {
  const d = hits + builds;
  if (d === 0) return null;
  return Math.round((hits / d) * 10_000) / 10_000;
}

export function getCacheLayerMetrics(): {
  cache_layer: typeof cacheLayer;
  cache_hit_rates: Record<string, number | null>;
} {
  const fHits = cacheLayer.feed_foryou_valkey_hits;
  const fBuilds = cacheLayer.feed_foryou_builds;
  const sHits = cacheLayer.live_streams_valkey_hits;
  const sBuilds = cacheLayer.live_streams_builds;
  const gHits = cacheLayer.gifts_valkey_hits + cacheLayer.gifts_mem_hits;
  const gBuilds = cacheLayer.gifts_builds;
  const cHits = cacheLayer.coin_packages_valkey_hits + cacheLayer.coin_packages_mem_hits;
  const cBuilds = cacheLayer.coin_packages_builds;
  const pValkey = cacheLayer.profiles_list_valkey_hits;
  const pMem = cacheLayer.profiles_list_mem_hits;
  const pBuilds = cacheLayer.profiles_list_builds;
  return {
    cache_layer: { ...cacheLayer },
    cache_hit_rates: {
      feed_foryou_valkey: rate(fHits, fBuilds),
      live_streams_valkey: rate(sHits, sBuilds),
      gifts_cached: rate(gHits, gBuilds),
      coin_packages_cached: rate(cHits, cBuilds),
      profiles_list_valkey: rate(pValkey, pBuilds),
      profiles_list_any_cache: rate(pValkey + pMem, pBuilds),
    },
  };
}
