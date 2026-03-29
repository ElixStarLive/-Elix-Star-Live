import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Play, Wand2, Download, Share2, Sparkles } from 'lucide-react';
import AIToolsPanel from '../components/AIToolsPanel';
import { enhanceSettingsToCss, DEFAULT_ENHANCE, autoEnhance, type EnhanceSettings } from '../lib/ai/enhance';

export default function AIStudio() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [filterCss, setFilterCss] = useState('none');
  const [enhanceCss, setEnhanceCss] = useState('none');
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const combinedFilter = [filterCss, enhanceCss].filter(f => f && f !== 'none').join(' ') || undefined;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setIsPlaying(true);
  };

  const togglePlayback = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleAutoEnhance = () => {
    if (!videoRef.current) return;
    const settings = autoEnhance(videoRef.current);
    setEnhanceCss(enhanceSettingsToCss(settings));
    showToast('AI Auto-Enhanced');
  };

  const handleExport = async () => {
    if (!videoRef.current || !canvasRef.current) {
      showToast('Load a video first');
      return;
    }
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (combinedFilter) ctx.filter = combinedFilter;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) { showToast('Export failed'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elix-ai-frame-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Frame exported');
    } catch {
      showToast('Export failed');
    }
  };

  return (
    <div className="h-full min-h-0 w-full bg-[#13151A] text-white flex flex-col overflow-hidden">
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-[#C9A96E]/20 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl z-[9999]">
          {toast}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} title="Select video" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={handleExport} className="p-1" title="Export frame">
          <Download size={16} className="text-white/70" />
        </button>
        <div className="flex items-center gap-2">
          <Wand2 size={15} className="text-[#C9A96E]" />
          <span className="text-white font-bold text-sm">AI Studio</span>
        </div>
        <button onClick={() => navigate(-1)} className="p-1">
          <img src="/Icons/Gold power buton.png" alt="Back" className="w-4 h-4" />
        </button>
      </header>

      {/* Video Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              autoPlay
              loop
              playsInline
              muted
              style={{ filter: combinedFilter }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <button
              onClick={togglePlayback}
              className="absolute inset-0 flex items-center justify-center z-10"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {!isPlaying && (
                <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
                  <Play size={30} className="text-white ml-1" />
                </div>
              )}
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 p-8">
            <div className="w-24 h-24 rounded-2xl bg-[#1C1E24] flex items-center justify-center">
              <Upload size={36} className="text-[#C9A96E]" />
            </div>
            <p className="text-white/50 text-sm text-center">Import a video to start editing with AI tools</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full bg-[#C9A96E] text-black font-bold text-sm flex items-center gap-2"
            >
              <Upload size={16} /> Select Video
            </button>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-around px-4 py-3 border-t border-white/5 flex-shrink-0">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1"
        >
          <Upload size={16} className="text-white/60" />
          <span className="text-[10px] text-white/40">Import</span>
        </button>
        <button onClick={handleAutoEnhance} className="flex flex-col items-center gap-1">
          <Sparkles size={16} className="text-[#C9A96E]" />
          <span className="text-[10px] text-[#C9A96E]">Auto AI</span>
        </button>
        <button
          onClick={() => setShowTools(true)}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A96E] to-[#B8943F] flex items-center justify-center shadow-lg shadow-[#C9A96E]/20">
            <Wand2 size={18} className="text-black" />
          </div>
          <span className="text-[10px] text-white/60">AI Tools</span>
        </button>
        <button onClick={() => { setFilterCss('none'); setEnhanceCss('none'); showToast('Reset'); }} className="flex flex-col items-center gap-1">
          <ArrowLeft size={16} className="text-white/60 rotate-[135deg]" />
          <span className="text-[10px] text-white/40">Reset</span>
        </button>
        <button onClick={handleExport} className="flex flex-col items-center gap-1">
          <Share2 size={16} className="text-white/60" />
          <span className="text-[10px] text-white/40">Export</span>
        </button>
      </div>

      <AIToolsPanel
        isOpen={showTools}
        onClose={() => setShowTools(false)}
        videoUrl={videoUrl}
        videoRef={videoRef}
        onFilterChange={setFilterCss}
        onEnhanceChange={setEnhanceCss}
        onCaptionSelect={(caption) => { if (caption) showToast('Caption applied'); }}
        onThumbnailSelect={() => { showToast('Thumbnail selected'); }}
        onVoiceEffectChange={() => { showToast('Voice effect applied'); }}
      />
    </div>
  );
}
