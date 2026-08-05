# For You Feed Algorithm

Backend-owned. Clients must not decide which VOD remains in For You.

## Lifecycle

1. **Initial** — every new public upload enrolls (`enrollVideoInForYou` on save).
2. **Promoted** — reaches `promotion_qualified_views` (default **5000** qualified unique views).
3. **Removed** — fails to reach promote threshold within `removal_window_hours` (default 168h). Video stays on profile/search/direct/share/saves/history.
4. **Re-entry eligible** — after removal, gains `reentry_additional_qualified_views` (default **1000**) new qualified uniques.
5. **Reentered** — only if ranking score &gt; 0 (quality signals). Not guaranteed.
6. **Exhausted** — hit `max_recommendation_cycles`.

## Ranking

Multi-signal score (`server/lib/feed/foryouRanking.ts`): qualified views, watch time, completion, rewatches, shares, saves, comments, likes, follows, profile visits, report rate, not interested, retention, freshness, creator quality, guidelines. Fraudulent engagement is rejected before qualification.

## Admin

`GET/PATCH /api/admin/monetisation/foryou-config` — all thresholds and weights.  
`POST /api/admin/monetisation/foryou-sweep` — expire windows + rescore.

## Client contract

`GET /api/feed/foryou` returns only active stages. Frontend must not filter For You candidates further for ranking purposes.
