import React, { useState, useEffect } from 'react';
import { request } from '../lib/apiClient';
import { Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../lib/analytics';
import { AvatarRing } from '../components/AvatarRing';
import { avatarUploadService } from '../lib/avatarUploadService';
import { showToast } from '../lib/toast';
import { useAuthStore } from '../store/useAuthStore';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

interface Profile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  tiktok: string | null;
}

export default function EditProfile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [profile, setProfile] = useState<Profile>({
    username: '',
    display_name: '',
    bio: '',
    avatar_url: '',
    website: '',
    instagram: '',
    youtube: '',
    tiktok: '',
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    // Reload profile once auth store has the current user ID
    if (user?.id) {
      loadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadProfile = async () => {
    try {
      if (!user?.id) return;
      setCurrentUserId(user.id);

      const { data: body, error } = await request(`/api/profiles/${encodeURIComponent(user.id)}`);
      if (error) return;
      const data = body?.profile || body;
      if (data) {
        setProfile({
          username: data.username || user.username || '',
          display_name: data.displayName || user.name || '',
          bio: data.bio || '',
          avatar_url: data.avatarUrl || user.avatar || '',
          website: data.website || '',
          instagram: data.instagram || '',
          youtube: data.youtube || '',
          tiktok: data.tiktok || '',
        });
      }
    } catch {
      showToast('Failed to load profile');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!currentUserId && !user?.id) {
      showToast('Please log in again');
      return;
    }
    const uid = currentUserId || (user as NonNullable<typeof user>).id;

    setUploading(true);
    try {
      const result = await avatarUploadService.uploadAvatar(file, uid);

      if (result.success && result.publicUrl) {
        setProfile((prev) => ({ ...prev, avatar_url: (result.publicUrl as NonNullable<typeof result.publicUrl>) }));
        try {
          localStorage.setItem('elix_avatar_' + uid, result.publicUrl);
        } catch {
          /* ignore */
        }
        trackEvent('profile_avatar_change', {});
        updateUser({ avatar: result.publicUrl });
        showToast('Photo updated');
      } else {
        showToast(result.error || 'Failed to upload avatar');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to upload avatar';
      showToast(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUserId && !user?.id) {
      showToast('Please log in again');
      return;
    }
    const uid = currentUserId || (user as NonNullable<typeof user>).id;

    const nextUsername = (profile.username || '').trim().replace(/^@+/, '');
    if (!nextUsername) {
      showToast('Username is required');
      return;
    }
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(nextUsername)) {
      showToast('Username: 3–30 letters, numbers, . or _');
      return;
    }

    setLoading(true);
    try {
      const { error } = await request(`/api/profiles/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          username: nextUsername,
          displayName: profile.display_name,
          bio: profile.bio,
          avatarUrl: profile.avatar_url,
          website: profile.website,
          instagram: profile.instagram,
          youtube: profile.youtube,
          tiktok: profile.tiktok,
        }),
      });

      if (error) {
        showToast(error.message || 'Failed to save profile');
        return;
      }

      trackEvent('profile_update', {});
      if (user?.id === uid) {
        updateUser({
          username: nextUsername,
          name: profile.display_name || user.name,
          avatar: profile.avatar_url || user.avatar,
        });
      }
      if (profile.avatar_url) {
        try {
          localStorage.setItem('elix_avatar_' + uid, profile.avatar_url);
        } catch {
          /* ignore */
        }
      }
      showToast('Profile saved');
      navigate(-1);
    } catch {
      showToast('Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between bg-[#111111]">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-1.5 rounded-full bg-[#D4AF37] text-black text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        <h1 className="text-lg font-bold text-center flex-1 text-gold-bright">Edit Profile</h1>
        <div className="w-[64px]" aria-hidden />
      </div>

      <div className="px-4 pt-2 pb-4 space-y-4 flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <div className="relative group cursor-pointer">
            <div onClick={() => document.getElementById('avatar-upload')?.click()}>
              <AvatarRing src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.username}`} alt="Avatar" size={96} />
            </div>
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 w-8 h-8 bg-[#D4AF37] rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition shadow-lg"
            >
              <Camera className="w-4 h-4 text-black" />
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <button 
            type="button"
            onClick={() => document.getElementById('avatar-upload')?.click()}
            className="text-sm font-semibold text-gold-bright/80 hover:text-gold-bright transition"
          >
            Change Photo
          </button>
          {uploading && <p className="text-xs text-gold-bright/60">Uploading...</p>}
        </div>

        {/* Form Fields */}
        <div className="space-y-3 flex-1 min-h-0">
          <InputField
            label="Username"
            value={profile.username || ''}
            onChange={(val) =>
              setProfile((prev) => ({
                ...prev,
                username: val.replace(/^@+/, '').replace(/\s+/g, ''),
              }))
            }
            placeholder="your_username"
            maxLength={30}
          />

          <InputField
            label="Display Name"
            value={profile.display_name || ''}
            onChange={val => setProfile(prev => ({ ...prev, display_name: val }))}
            placeholder="Your display name"
            maxLength={50}
          />

          <TextAreaField
            label="Bio"
            value={profile.bio || ''}
            onChange={val => setProfile(prev => ({ ...prev, bio: val }))}
            placeholder="Tell us about yourself..."
            maxLength={150}
          />

          <InputField
            label="Website"
            value={profile.website || ''}
            onChange={val => setProfile(prev => ({ ...prev, website: val }))}
            placeholder="https://yoursite.com"
            maxLength={100}
          />

          <Divider label="Social Links" />

          <InputField
            label="Instagram"
            value={profile.instagram || ''}
            onChange={val => setProfile(prev => ({ ...prev, instagram: val }))}
            placeholder="@username"
            maxLength={50}
          />

          <InputField
            label="YouTube"
            value={profile.youtube || ''}
            onChange={val => setProfile(prev => ({ ...prev, youtube: val }))}
            placeholder="@channelname"
            maxLength={50}
          />

          <InputField
            label="TikTok"
            value={profile.tiktok || ''}
            onChange={val => setProfile(prev => ({ ...prev, tiktok: val }))}
            placeholder="@username"
            maxLength={50}
          />
        </div>
      </div>
      </div>
    </SettingsOptionSheet>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gold-bright/80 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-white/[0.06] rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-gold-bright placeholder:text-gold-bright/35 border border-white/10 focus:border-[#D4AF37]/50 focus:outline-none transition"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gold-bright/80 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        className="w-full bg-white/[0.06] rounded-lg px-3 py-2.5 outline-none text-sm leading-relaxed text-gold-bright placeholder:text-gold-bright/35 border border-white/10 focus:border-[#D4AF37]/50 focus:outline-none transition resize-none"
      />
      {maxLength && (
        <p className="text-[11px] text-gold-bright/40 mt-1 text-right leading-none">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 h-px bg-white/10"></div>
      <span className="text-xs text-gold-bright/50 font-semibold uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-white/10"></div>
    </div>
  );
}


