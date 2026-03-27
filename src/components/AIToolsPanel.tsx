import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Sparkles, Sliders, Hash, Image, Mic, Subtitles, Eraser, Wand2, ChevronDown } from 'lucide-react';
import {
  FILTER_PRESETS, FilterPreset, FilterCategory,
  DEFAULT_ENHANCE, EnhanceSettings, autoEnhance, enhanceSettingsToCss,
  generateCaptions, generateHashtags, CaptionSuggestion,
  extractThumbnails, ThumbnailCandidate,
  VOICE_EFFECTS, VoiceEffect,
  SubtitleGenerator, SUBTITLE_STYLES, SUBTITLE_LANGUAGES, SubtitleStyle,
  BACKGROUND_OPTIONS, BackgroundOption,
} from '../lib/ai';

type AITab = 'filters' | 'enhance' | 'captions' | 'thumbnails' | 'voice' | 'subtitles' | 'background';

interface AIToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onFilterChange?: (css: string) => void;
  onEnhanceChange?: (css: string) => void;
  onCaptionSelect?: (caption: string, hashtags: string[]) => void;
  onThumbnailSelect?: (dataUrl: string) => void;
  onVoiceEffectChange?: (effectId: string) => void;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
  onBackgroundChange?: (option: BackgroundOption) => void;
}

const TAB_CONFIG: { id: AITab; label: string; icon: React.ReactNode }[] = [
  { id: 'filters', label: 'Filters', icon: <Sparkles size={16} /> },
  { id: 'enhance', label: 'Enhance', icon: <Sliders size={16} /> },
  { id: 'captions', label: 'Captions', icon: <Hash size={16} /> },
  { id: 'thumbnails', label: 'Thumbnail', icon: <Image size={16} /> },
  { id: 'voice', label: 'Voice FX', icon: <Mic size={16} /> },
  { id: 'subtitles', label: 'Subtitles', icon: <Subtitles size={16} /> },
  { id: 'background', label: 'Background', icon: <Eraser size={16} /> },
];

const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'mood', label: 'Mood' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'artistic', label: 'Artistic' },
];

export default function AIToolsPanel({
  isOpen,
  onClose,
  videoUrl,
  videoRef,
  onFilterChange,
  onEnhanceChange,
  onCaptionSelect,
  onThumbnailSelect,
  onVoiceEffectChange,
  onSubtitleStyleChange,
  onBackgroundChange,
}: AIToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<AITab>('filters');
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [filterIntensity, setFilterIntensity] = useState(100);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('cinematic');
  const [enhance, setEnhance] = useState<EnhanceSettings>(DEFAULT_ENHANCE);
  const [captionInput, setCaptionInput] = useState('');
  const [captionSuggestions, setCaptionSuggestions] = useState<CaptionSuggestion[]>([]);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<ThumbnailCandidate[]>([]);
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('none');
  const [selectedSubStyle, setSelectedSubStyle] = useState('classic');
  const [subLang, setSubLang] = useState('en-US');
  const [isSubtitling, setIsSubtitling] = useState(false);
  const [selectedBg, setSelectedBg] = useState('none');
  const subtitleGenRef = useRef<SubtitleGenerator | null>(null);

  const handleFilterSelect = useCallback((filter: FilterPreset) => {
    setSelectedFilter(filter.id);
    if (filter.css === 'none') {
      onFilterChange?.('none');
    } else {
      const intensity = filterIntensity / 100;
      const parts = filter.css.split(' ');
      const scaled = parts.map(part => {
        const match = part.match(/^(\w[\w-]*)\(([^)]+)\)$/);
        if (!match) return part;
        const [, fn, val] = match;
        const num = parseFloat(val);
        if (isNaN(num)) return part;
        const unit = val.replace(String(num), '');
        const base = fn === 'brightness' || fn === 'contrast' || fn === 'saturate' ? 1 : 0;
        const adjusted = base + (num - base) * intensity;
        return `${fn}(${adjusted}${unit})`;
      });
      onFilterChange?.(scaled.join(' '));
    }
  }, [filterIntensity, onFilterChange]);

  const handleEnhanceSlider = useCallback((key: keyof EnhanceSettings, value: number) => {
    setEnhance(prev => {
      const next = { ...prev, [key]: value };
      onEnhanceChange?.(enhanceSettingsToCss(next));
      return next;
    });
  }, [onEnhanceChange]);

  const handleAutoEnhance = useCallback(() => {
    if (videoRef?.current) {
      const settings = autoEnhance(videoRef.current);
      setEnhance(settings);
      onEnhanceChange?.(enhanceSettingsToCss(settings));
    }
  }, [videoRef, onEnhanceChange]);

  const handleResetEnhance = useCallback(() => {
    setEnhance(DEFAULT_ENHANCE);
    onEnhanceChange?.('none');
  }, [onEnhanceChange]);

  const handleGenerateCaptions = useCallback(() => {
    const suggestions = generateCaptions(captionInput);
    setCaptionSuggestions(suggestions);
    const tags = generateHashtags(captionInput, 10);
    setGeneratedHashtags(tags);
  }, [captionInput]);

  const handleExtractThumbnails = useCallback(async () => {
    if (!videoUrl) return;
    setIsLoadingThumbnails(true);
    try {
      const candidates = await extractThumbnails(videoUrl, 8);
      setThumbnails(candidates);
    } finally {
      setIsLoadingThumbnails(false);
    }
  }, [videoUrl]);

  useEffect(() => {
    if (activeTab === 'thumbnails' && videoUrl && thumbnails.length === 0) {
      handleExtractThumbnails();
    }
  }, [activeTab, videoUrl, thumbnails.length, handleExtractThumbnails]);

  const toggleSubtitles = useCallback(() => {
    if (isSubtitling) {
      subtitleGenRef.current?.stop();
      setIsSubtitling(false);
    } else {
      if (!subtitleGenRef.current) {
        subtitleGenRef.current = new SubtitleGenerator();
      }
      if (!subtitleGenRef.current.supported) return;
      subtitleGenRef.current.start(() => {}, subLang);
      setIsSubtitling(true);
    }
  }, [isSubtitling, subLang]);

  if (!isOpen) return null;

  const filteredPresets = FILTER_PRESETS.filter(f => f.category === filterCategory || f.id === 'none');

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-[#13151A] border-t border-[#C9A96E]/20 rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ maxHeight: '70dvh' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#C9A96E]/10">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-[#C9A96E]" />
            <span className="text-white font-bold text-sm">AI Studio</span>
          </div>
          <button onClick={onClose} className="p-1" title="Close AI Studio"><X size={18} className="text-white/60" /></button>
        </div>

        {/* Tab Bar */}
        <div className="flex overflow-x-auto no-scrollbar px-2 py-2 gap-1 border-b border-white/5">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#C9A96E] text-black'
                  : 'bg-[#1C1E24] text-white/70 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(70dvh - 100px)' }}>

          {/* FILTERS TAB */}
          {activeTab === 'filters' && (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {FILTER_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      filterCategory === cat.id ? 'bg-[#C9A96E]/20 text-[#C9A96E]' : 'bg-[#1C1E24] text-white/50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {filteredPresets.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => handleFilterSelect(filter)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                      selectedFilter === filter.id
                        ? 'bg-[#C9A96E]/20 ring-1 ring-[#C9A96E]'
                        : 'bg-[#1C1E24] hover:bg-[#1C1E24]/80'
                    }`}
                  >
                    <span className="text-2xl">{filter.preview}</span>
                    <span className="text-[10px] text-white/70 leading-tight text-center">{filter.name}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1">
                  <span>Intensity</span>
                  <span>{filterIntensity}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={filterIntensity}
                  onChange={e => {
                    setFilterIntensity(Number(e.target.value));
                    const f = FILTER_PRESETS.find(p => p.id === selectedFilter);
                    if (f) handleFilterSelect(f);
                  }}
                  className="w-full accent-[#C9A96E] h-1"
                  title="Filter intensity"
                />
              </div>
            </div>
          )}

          {/* ENHANCE TAB */}
          {activeTab === 'enhance' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={handleAutoEnhance} className="flex-1 py-2 rounded-xl bg-[#C9A96E] text-black text-xs font-bold flex items-center justify-center gap-1.5">
                  <Wand2 size={14} /> Auto Enhance
                </button>
                <button onClick={handleResetEnhance} className="flex-1 py-2 rounded-xl bg-[#1C1E24] text-white/70 text-xs font-bold">
                  Reset
                </button>
              </div>
              {([
                ['brightness', 'Brightness', -50, 50],
                ['contrast', 'Contrast', -50, 50],
                ['saturation', 'Saturation', -50, 50],
                ['warmth', 'Warmth', -50, 50],
                ['sharpness', 'Sharpness', 0, 100],
                ['vignette', 'Vignette', 0, 100],
                ['grain', 'Film Grain', 0, 100],
                ['fade', 'Fade', 0, 100],
              ] as [keyof EnhanceSettings, string, number, number][]).map(([key, label, min, max]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>{label}</span>
                    <span>{enhance[key]}</span>
                  </div>
                  <input
                    type="range" min={min} max={max} value={enhance[key]}
                    onChange={e => handleEnhanceSlider(key, Number(e.target.value))}
                    className="w-full accent-[#C9A96E] h-1"
                    title={label}
                  />
                </div>
              ))}
            </div>
          )}

          {/* CAPTIONS TAB */}
          {activeTab === 'captions' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Describe your video</label>
                <textarea
                  value={captionInput}
                  onChange={e => setCaptionInput(e.target.value)}
                  placeholder="Dance video with friends at sunset..."
                  className="w-full bg-[#1C1E24] text-white text-sm rounded-xl px-3 py-2 border border-white/10 resize-none h-20 outline-none focus:border-[#C9A96E]/50"
                />
              </div>
              <button
                onClick={handleGenerateCaptions}
                className="w-full py-2.5 rounded-xl bg-[#C9A96E] text-black text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Sparkles size={14} /> Generate AI Captions & Hashtags
              </button>
              {captionSuggestions.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs text-white/50">AI Suggestions</span>
                  {captionSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => onCaptionSelect?.(s.caption, s.hashtags)}
                      className="w-full text-left p-3 rounded-xl bg-[#1C1E24] hover:bg-[#1C1E24]/70 transition-colors"
                    >
                      <p className="text-white text-sm mb-1">{s.caption}</p>
                      <p className="text-[#C9A96E] text-xs">
                        {s.hashtags.map(h => `#${h}`).join(' ')}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-[#C9A96E]" style={{ width: `${s.score * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-white/30">{Math.round(s.score * 100)}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {generatedHashtags.length > 0 && (
                <div>
                  <span className="text-xs text-white/50 block mb-2">Trending Hashtags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {generatedHashtags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => onCaptionSelect?.('', [tag])}
                        className="px-2.5 py-1 rounded-full bg-[#C9A96E]/10 text-[#C9A96E] text-xs font-medium hover:bg-[#C9A96E]/20 transition-colors"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* THUMBNAILS TAB */}
          {activeTab === 'thumbnails' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">AI-ranked best frames</span>
                <button
                  onClick={handleExtractThumbnails}
                  className="px-3 py-1 rounded-full bg-[#C9A96E]/20 text-[#C9A96E] text-xs font-semibold"
                >
                  Refresh
                </button>
              </div>
              {isLoadingThumbnails ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : thumbnails.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">
                  {videoUrl ? 'No frames extracted yet' : 'Record or upload a video first'}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {thumbnails.map((thumb, i) => (
                    <button
                      key={i}
                      onClick={() => onThumbnailSelect?.(thumb.dataUrl)}
                      className="relative rounded-xl overflow-hidden aspect-[9/16] group"
                    >
                      <img src={thumb.dataUrl} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">Use</span>
                      </div>
                      {i === 0 && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[#C9A96E] text-black text-[8px] font-bold">
                          BEST
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/60 text-white text-[8px]">
                        {Math.round(thumb.score * 100)}%
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VOICE FX TAB */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              <p className="text-xs text-white/50">Apply voice effects to your recording</p>
              <div className="grid grid-cols-3 gap-2">
                {VOICE_EFFECTS.map(effect => (
                  <button
                    key={effect.id}
                    onClick={() => {
                      setSelectedVoice(effect.id);
                      onVoiceEffectChange?.(effect.id);
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                      selectedVoice === effect.id
                        ? 'bg-[#C9A96E]/20 ring-1 ring-[#C9A96E]'
                        : 'bg-[#1C1E24] hover:bg-[#1C1E24]/80'
                    }`}
                  >
                    <span className="text-xl">{effect.icon}</span>
                    <span className="text-[10px] text-white/70 text-center leading-tight">{effect.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SUBTITLES TAB */}
          {activeTab === 'subtitles' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Language</label>
                <div className="relative">
                  <select
                    value={subLang}
                    onChange={e => setSubLang(e.target.value)}
                    className="w-full bg-[#1C1E24] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 outline-none appearance-none"
                    title="Subtitle language"
                  >
                    {SUBTITLE_LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                </div>
              </div>
              <button
                onClick={toggleSubtitles}
                className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                  isSubtitling
                    ? 'bg-red-500 text-white'
                    : 'bg-[#C9A96E] text-black'
                }`}
              >
                <Subtitles size={14} />
                {isSubtitling ? 'Stop Auto-Subtitles' : 'Start Auto-Subtitles'}
              </button>
              <div>
                <span className="text-xs text-white/50 block mb-2">Subtitle Style</span>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTITLE_STYLES.map(style => (
                    <button
                      key={style.id}
                      onClick={() => {
                        setSelectedSubStyle(style.id);
                        onSubtitleStyleChange?.(style);
                      }}
                      className={`p-3 rounded-xl text-left transition-all ${
                        selectedSubStyle === style.id
                          ? 'bg-[#C9A96E]/20 ring-1 ring-[#C9A96E]'
                          : 'bg-[#1C1E24]'
                      }`}
                    >
                      <div
                        className="text-sm font-bold mb-0.5 truncate"
                        style={{
                          fontFamily: style.fontFamily,
                          color: style.color.startsWith('linear') ? '#C9A96E' : style.color,
                        }}
                      >
                        {style.name}
                      </div>
                      <div className="text-[10px] text-white/30">{style.animation} · {style.position}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BACKGROUND TAB */}
          {activeTab === 'background' && (
            <div className="space-y-4">
              <p className="text-xs text-white/50">Replace or blur your background</p>
              <div className="grid grid-cols-3 gap-2">
                {BACKGROUND_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSelectedBg(opt.id);
                      onBackgroundChange?.(opt);
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                      selectedBg === opt.id
                        ? 'bg-[#C9A96E]/20 ring-1 ring-[#C9A96E]'
                        : 'bg-[#1C1E24] hover:bg-[#1C1E24]/80'
                    }`}
                  >
                    <span className="text-xl">{opt.preview}</span>
                    <span className="text-[10px] text-white/70 text-center leading-tight">{opt.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
