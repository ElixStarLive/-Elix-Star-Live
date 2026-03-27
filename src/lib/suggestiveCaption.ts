/**
 * Heuristic for captions/hashtags used to surface swimwear / similar clips on For You
 * after mutual videos (same /feed page, no separate Explore-only bucket).
 */
const KEYWORDS = [
  'bikini',
  'bikiny',
  'swimwear',
  'swimsuit',
  'beach',
  'pool',
  'poolside',
  'lingerie',
  'two piece',
  '2 piece',
];

export function isSuggestiveCaption(description: string, hashtags: string[] = []): boolean {
  const text = `${description || ''} ${(hashtags || []).join(' ')}`.toLowerCase();
  return KEYWORDS.some((k) => text.includes(k));
}

/** Extra STEM slots: suggestive + common “spicy” tags (not shown in main trending slice). */
const INDECENTISH = [
  'nsfw',
  'sexy',
  'nude',
  'nudity',
  'onlyfans',
  'porn',
  'xxx',
  'hot',
  'thirst',
  'spicy',
  '18+',
  'adult',
  'explicit',
];

export function isStemIndecentishCaption(description: string, hashtags: string[] = []): boolean {
  const text = `${description || ''} ${(hashtags || []).join(' ')}`.toLowerCase();
  return INDECENTISH.some((k) => text.includes(k));
}

/** STEM: after top-by-views, also pull clips matching suggestive OR indecentish captions. */
export function isStemExtraCaption(description: string, hashtags: string[] = []): boolean {
  return isSuggestiveCaption(description, hashtags) || isStemIndecentishCaption(description, hashtags);
}

/**
 * Explore / Discover “Trending” strip: only clips whose caption or hashtags match
 * indecent-style keywords (not general app-wide trending).
 */
export function isIndecentExploreCaption(description: string, hashtags: string[] = []): boolean {
  return isStemIndecentishCaption(description, hashtags);
}
