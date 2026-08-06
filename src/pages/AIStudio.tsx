import React, { useState, useRef, useCallback } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Play, Wand2, Download, Share2, Sparkles } from 'lucide-react';
import AIToolsPanel from '../components/AIToolsPanel';
import { enhanceSettingsToCss, autoEnhance } from '../lib/ai/enhance';

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

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openTools = useCallback(() => {
    setShowTools(true);
  }, []);

  const closeTools = useCallback(() => {
    setShowTools(false);
  }, []);

  const handleReset = useCallback(() => {
    setFilterCss('none');
    setEnhanceCss('none');
    showToast('Reset');
  }, []);

  const combinedFilter = [filterCss, enhanceCss].filter(f => f && f !== 'none').join(' ') || undefined;

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setIsPlaying(true);
  }, [videoUrl]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleAutoEnhance = useCallback(() => {
    if (!videoRef.current) return;
    const settings = autoEnhance(videoRef.current);
    setEnhanceCss(enhanceSettingsToCss(settings));
    showToast('AI Auto-Enhanced');
  }, []);

  const handleExport = useCallback(async () => {
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
  }, [combinedFilter]);

  return (
    <div className="h-full min-h-0 w-full bg-[#09090B] text-white flex flex-col overflow-hidden">
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-[#6F3FF5]/20 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl z-[9999]">
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
          <Wand2 size={15} className="text-[#F5F5F7]" />
          <span className="text-white font-bold text-sm">AI Studio</span>
        </div>
        <button onClick={goBack} className="p-1">
          <RoyceBackIcon />
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
            <div className="w-24 h-24 rounded-2xl bg-[#09090B] flex items-center justify-center">
              <Upload size={36} className="text-[#F5F5F7]" />
            </div>
            <p className="elix-silver-red-text text-sm text-center">Import a video to start editing with AI tools</p>
            <button
              onClick={openFilePicker}
              className="px-6 py-3 rounded-full bg-transparent border border-white/30 font-bold text-sm flex items-center gap-2 active:opacity-70"
            >
              <Upload size={16} className="text-[#F5F5F7]" />
              <span className="elix-silver-red-text">Select Video</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Action Bar — no solid red active fills; writing only */}
      <div className="flex items-center justify-around px-4 py-3 border-t border-white/5 flex-shrink-0">
        <button
          onClick={openFilePicker}
          className="flex flex-col items-center gap-1 active:opacity-70"
        >
          <Upload size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Import</span>
        </button>
        <button onClick={handleAutoEnhance} className="flex flex-col items-center gap-1 active:opacity-70">
          <Sparkles size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Auto AI</span>
        </button>
        <button
          onClick={openTools}
          className="flex flex-col items-center gap-1 active:opacity-70"
        >
          <Wand2 size={18} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">AI Tools</span>
        </button>
        <button onClick={handleReset} className="flex flex-col items-center gap-1 active:opacity-70">
          <ArrowLeft size={16} className="text-[#F5F5F7] rotate-[135deg]" />
          <span className="elix-silver-red-text text-[10px]">Reset</span>
        </button>
        <button onClick={handleExport} className="flex flex-col items-center gap-1 active:opacity-70">
          <Share2 size={16} className="text-[#F5F5F7]" />
          <span className="elix-silver-red-text text-[10px]">Export</span>
        </button>
      </div>

      <AIToolsPanel
        isOpen={showTools}
        onClose={closeTools}
        videoUrl={videoUrl}
        videoRef={videoRef}
        onFilterChange={setFilterCss}
        onEnhanceChange={setEnhanceCss}
        onCaptionSelect={(caption) => { if (caption) showToast('Caption ready — copy it from AI Tools'); }}
        onThumbnailSelect={() => { showToast('Thumbnail uses the filtered frame on export'); }}
        onVoiceEffectChange={() => { showToast('Voice preview — AI Studio exports the filtered frame only'); }}
      />
    </div>
  );
}
