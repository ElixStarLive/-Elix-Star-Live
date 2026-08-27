import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { User } from 'lucide-react';
import { fetchProfile, type PublicProfile } from '../features/users/usersApi';
import { useAuthStore } from '../features/auth/authStore';

export default function Profile() {
  const params = useParams<{ userId: string }>();
  const currentUser = useAuthStore((state) => state.user);
  const userId = params.userId ?? currentUser?.id ?? '';

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId).then(({ data, error: apiError }) => {
      if (cancelled) return;
      if (apiError) {
        setError(apiError.message);
        return;
      }
      if (data) setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
        <p>{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white/60">
        <p>Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] p-4 text-white">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
            <User className="h-10 w-10 text-white/40" />
          </div>
        )}
        <div>
          <h1 className="text-fluid-xl font-bold">{profile.displayName}</h1>
          <p className="text-fluid-sm text-white/60">@{profile.username}</p>
        </div>
      </div>

      {profile.bio && <p className="mt-4 text-fluid-sm text-white/80">{profile.bio}</p>}

      <div className="mt-6 flex gap-6 text-fluid-sm text-white/70">
        <span><strong className="text-white">{profile.videoCount}</strong> videos</span>
        <span><strong className="text-white">{profile.followers}</strong> followers</span>
        <span><strong className="text-white">{profile.following}</strong> following</span>
      </div>
    </div>
  );
}
