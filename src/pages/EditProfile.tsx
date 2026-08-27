import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchMyProfile, patchProfile, type PublicProfile } from '../features/users/usersApi';

export default function EditProfile() {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyProfile().then(({ data }) => {
      if (cancelled || !data) return;
      setProfile(data);
      setDisplayName(data.displayName);
      setBio(data.bio);
      setAvatarUrl(data.avatarUrl);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exit = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  }, [navigate, location.state]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const body: { displayName?: string; bio?: string; avatarUrl?: string } = {
      displayName: displayName.trim(),
      bio: bio.trim(),
    };
    const trimmedAvatar = avatarUrl.trim();
    if (trimmedAvatar) body.avatarUrl = trimmedAvatar;

    const { error: apiError } = await patchProfile(body);

    setSaving(false);
    if (apiError) {
      setError(apiError.message);
      return;
    }
    exit();
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Edit Profile</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <form onSubmit={onSubmit} className="flex-1 space-y-4 p-4">
        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
            maxLength={60}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="h-32 w-full resize-none rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
            maxLength={500}
          />
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Avatar URL</label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !profile}
          className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
