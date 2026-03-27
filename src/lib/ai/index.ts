export { FILTER_PRESETS, applyFilterToCanvas, getFiltersByCategory } from './filters';
export type { FilterPreset, FilterCategory } from './filters';

export { DEFAULT_ENHANCE, enhanceSettingsToCss, applyEnhanceToCanvas, autoEnhance } from './enhance';
export type { EnhanceSettings } from './enhance';

export { generateCaptions, generateHashtags, generateTitle } from './captions';
export type { CaptionSuggestion } from './captions';

export { extractThumbnails, generateSmartThumbnail } from './thumbnails';
export type { ThumbnailCandidate } from './thumbnails';

export { VOICE_EFFECTS, VoiceProcessor, createNoiseGate } from './voice';
export type { VoiceEffect } from './voice';

export { SubtitleGenerator, SUBTITLE_STYLES, SUBTITLE_LANGUAGES, renderSubtitleToCanvas } from './subtitles';
export type { SubtitleSegment, SubtitleStyle } from './subtitles';

export { BACKGROUND_OPTIONS, applyBackgroundBlur, applyBackgroundColor, createSimpleSegmentationMask } from './background';
export type { BackgroundOption } from './background';
