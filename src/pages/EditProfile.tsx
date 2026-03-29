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
    if (!file || !currentUserId) return;

    setUploading(true);
    try {
      const result = await avatarUploadService.uploadAvatar(file, currentUserId);
      
      if (result.success && result.publicUrl) {
        setProfile(prev => ({ ...prev, avatar_url: result.publicUrl }));
        trackEvent('profile_avatar_change', {});
        if (user?.id) {
          updateUser({ avatar: result.publicUrl });
        }
      } else {
        showToast(result.error || 'Failed to upload avatar');
      }
    } catch (error) {

      showToast('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUserId) return;

    setLoading(true);
    try {
    const { error } = await request(`/api/profiles/${encodeURIComponent(currentUserId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
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
      showToast('Failed to save profile');
      setLoading(false);
      return;
    }

    trackEvent('profile_update', {});
    if (user?.id === currentUserId) {
      updateUser({
        name: profile.display_name || user.name,
        avatar: profile.avatar_url || user.avatar,
      });
    }
    navigate(-1);
  } catch {
    showToast('Failed to save profile');
  } finally {
    setLoading(false);
  }
  };

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-4 flex items-center justify-between bg-[#13151A]">
        {/* Left: smaller Save button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-3 py-1 rounded-full bg-[#C9A96E] text-black text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        {/* Center title */}
        <h1 className="text-lg font-bold text-center flex-1">Edit Profile</h1>
        {/* Right: Close/back power button, nudged left from the edge */}
        <button onClick={() => navigate(-1)} className="p-2 mr-3 hover:brightness-125 rounded-full transition">
          <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-6 space-y-6 flex-1 overflow-y-auto">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group cursor-pointer">
            <div onClick={() => document.getElementById('avatar-upload')?.click()}>
              <AvatarRing src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.username}`} alt="Avatar" size={96} />
            </div>
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 w-8 h-8 bg-[#C9A96E] rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition shadow-lg"
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
            className="text-sm font-semibold text-white hover:text-white/80 transition"
          >
            Change Photo
          </button>
          {uploading && <p className="text-sm text-white/60">Uploading...</p>}
          <p className="text-sm text-white/60">@{profile.username}</p>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
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
      <label className="block text-sm font-semibold text-white/80 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-[#13151A] rounded-lg px-4 py-3 outline-none text-white placeholder-white/40/40 border border-transparent focus:border-[#C9A96E] transition"
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
      <label className="block text-sm font-semibold text-white/80 mb-2">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={4}
        className="w-full bg-[#13151A] rounded-lg px-4 py-3 outline-none text-white placeholder-white/40/40 border border-transparent focus:border-[#C9A96E] transition resize-none"
      />
      {maxLength && (
        <p className="text-xs text-white/40 mt-1 text-right">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-[#13151A]"></div>
      <span className="text-xs text-white/40 font-semibold">{label}</span>
      <div className="flex-1 h-px bg-[#13151A]"></div>
    </div>
  );
}


