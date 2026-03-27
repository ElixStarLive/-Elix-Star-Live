const TRENDING_HASHTAGS = [
  'fyp', 'foryou', 'viral', 'trending', 'explore', 'reels', 'tiktok',
  'live', 'creator', 'content', 'follow', 'like', 'share', 'duet',
];

const CATEGORY_HASHTAGS: Record<string, string[]> = {
  music: ['music', 'song', 'singer', 'artist', 'beats', 'newmusic', 'musicvideo', 'studio', 'rap', 'pop', 'hiphop'],
  dance: ['dance', 'dancer', 'choreography', 'dancecover', 'dancechallenge', 'moves', 'dancevideo'],
  comedy: ['comedy', 'funny', 'humor', 'joke', 'skit', 'lol', 'funnyvideos', 'laughing'],
  beauty: ['beauty', 'makeup', 'skincare', 'glam', 'tutorial', 'beautytips', 'glow', 'grwm'],
  fitness: ['fitness', 'gym', 'workout', 'fit', 'health', 'training', 'motivation', 'bodybuilding'],
  food: ['food', 'cooking', 'recipe', 'foodie', 'chef', 'yummy', 'delicious', 'homemade'],
  travel: ['travel', 'wanderlust', 'explore', 'adventure', 'vacation', 'trip', 'destination'],
  fashion: ['fashion', 'style', 'outfit', 'ootd', 'streetstyle', 'fashionista', 'lookbook'],
  gaming: ['gaming', 'gamer', 'gameplay', 'twitch', 'esports', 'pc', 'console', 'streamer'],
  pets: ['pets', 'dog', 'cat', 'puppy', 'kitten', 'cute', 'animals', 'dogsoftiktok', 'catsoftiktok'],
  art: ['art', 'artist', 'drawing', 'painting', 'creative', 'artwork', 'sketch', 'digitalart'],
  education: ['education', 'learn', 'study', 'knowledge', 'tips', 'facts', 'science', 'howto'],
  lifestyle: ['lifestyle', 'life', 'motivation', 'inspiration', 'daily', 'vlog', 'routine', 'dayinmylife'],
};

const CAPTION_TEMPLATES = [
  "✨ {topic} vibes only",
  "This {topic} hits different 🔥",
  "POV: when {topic} is life",
  "No one talks about this {topic} hack 👀",
  "Wait for it... 🤯 #{topic}",
  "{topic} but make it aesthetic ✨",
  "Tell me you love {topic} without telling me",
  "The way this {topic} changed everything 🙌",
  "Obsessed with this {topic} content 💎",
  "Drop a ❤️ if you agree #{topic}",
];

export interface CaptionSuggestion {
  caption: string;
  hashtags: string[];
  score: number;
}

export function generateCaptions(
  description: string,
  category?: string
): CaptionSuggestion[] {
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const detectedCategories: string[] = [];

  for (const [cat, tags] of Object.entries(CATEGORY_HASHTAGS)) {
    const overlap = words.filter(w => tags.includes(w) || cat.includes(w));
    if (overlap.length > 0 || category === cat) {
      detectedCategories.push(cat);
    }
  }

  if (detectedCategories.length === 0) {
    detectedCategories.push('lifestyle');
  }

  const suggestions: CaptionSuggestion[] = [];

  for (const cat of detectedCategories.slice(0, 2)) {
    const catTags = CATEGORY_HASHTAGS[cat] || [];
    const trendingPick = TRENDING_HASHTAGS.sort(() => Math.random() - 0.5).slice(0, 3);
    const catPick = catTags.sort(() => Math.random() - 0.5).slice(0, 4);
    const hashtags = [...new Set([...catPick, ...trendingPick])].slice(0, 6);

    const template = CAPTION_TEMPLATES[Math.floor(Math.random() * CAPTION_TEMPLATES.length)];
    const caption = template.replace(/{topic}/g, cat);

    suggestions.push({ caption, hashtags, score: 0.85 + Math.random() * 0.15 });
  }

  const quickTags = TRENDING_HASHTAGS.sort(() => Math.random() - 0.5).slice(0, 5);
  suggestions.push({
    caption: description || 'Check this out! 🔥',
    hashtags: quickTags,
    score: 0.7 + Math.random() * 0.1,
  });

  return suggestions.sort((a, b) => b.score - a.score);
}

export function generateHashtags(description: string, count: number = 8): string[] {
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const result = new Set<string>();

  for (const [cat, tags] of Object.entries(CATEGORY_HASHTAGS)) {
    const overlap = words.filter(w => tags.includes(w) || cat.includes(w));
    if (overlap.length > 0) {
      tags.sort(() => Math.random() - 0.5).slice(0, 3).forEach(t => result.add(t));
    }
  }

  TRENDING_HASHTAGS.sort(() => Math.random() - 0.5).slice(0, 4).forEach(t => result.add(t));
  words.filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'what'].includes(w))
    .slice(0, 2).forEach(w => result.add(w));

  return Array.from(result).slice(0, count);
}

export function generateTitle(description: string): string {
  if (!description || description.length < 3) return 'Untitled';
  const words = description.split(/\s+/).slice(0, 8);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
