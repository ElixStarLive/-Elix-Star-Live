import { useState } from 'react';
import { ArrowLeft, X, Upload as UploadIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createVideo } from '../features/feed/feedApi';
import { uploadFile } from '../features/uploads/uploadsApi';

export default function Upload() {
  const navigate = useNavigate();
  const location = useLocation();

  const [url, setUrl] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/feed';
    navigate(from, { replace: true });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!url.trim()) {
      setError('A video URL is required.');
      return;
    }

    setSubmitting(true);
    const { data, error: apiError } = await createVideo({
      url: url.trim(),
      thumbnail: thumbnail.trim(),
      description: description.trim(),
      hashtags: hashtags
        .split(/[\s,]+/)
        .map((h) => h.trim().replace(/^#/, ''))
        .filter(Boolean),
    });
    setSubmitting(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }

    navigate(`/video/${data?.id}`, { replace: true });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const { data, error: uploadError } = await uploadFile(file);
    setUploading(false);
    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    if (data) setUrl(data.url);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Upload</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <form onSubmit={onSubmit} className="flex-1 space-y-4 p-4">
        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Video File</label>
          <input
            type="file"
            accept="video/*"
            onChange={onFile}
            disabled={uploading}
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none file:text-white file:bg-white/10 file:rounded-md file:px-3 file:py-1 file:border-0 disabled:opacity-60"
          />
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Video URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
            placeholder="https://..."
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Thumbnail URL (optional)</label>
          <input
            type="url"
            value={thumbnail}
            onChange={(e) => setThumbnail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
          />
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-32 w-full resize-none rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
          />
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Hashtags (space or comma separated)</label>
          <input
            type="text"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
            placeholder="comedy dance trending"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
        >
          <UploadIcon className="h-4 w-4" />
          {submitting ? 'Uploading…' : 'Upload Video'}
        </button>
      </form>
    </div>
  );
}
