import { useEffect, useRef, useState } from 'react';
import { BASE_URL, getToken } from '../api/tracks';

interface UserProfile {
  id: number;
  username: string;
  profileImageUrl?: string | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  onAvatarChange?: (url: string) => void;
}

export function ProfilePanel({ open, onClose, onLogout, onAvatarChange }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setAvatarUrl(data.profileImageUrl ?? null);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [open]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('profileImage', file);
    try {
      const res = await fetch(`${BASE_URL}/users/uploadProfileImage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        setAvatarUrl(data.profileImageUrl);
        onAvatarChange?.(data.profileImageUrl);
      }
    } catch {}
    finally { setUploading(false); }
  };

  const initials = profile?.username
    ? profile.username.slice(0, 2).toUpperCase()
    : '··';

  const joined = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  return (
    <>
      <div className={`panel-backdrop ${open ? 'visible' : ''}`} onClick={onClose} />

      <div className={`profile-panel ${open ? 'open' : ''}`}>
        {/* Drag handle */}
        <div className="panel-handle" onClick={onClose} />

        {loading ? (
          <div className="panel-loading"><span className="search-spinner" /></div>
        ) : profile ? (
          <div className="panel-inner">

            {/* ── Avatar ── */}
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-lg">
                {avatarUrl
                  ? <img src={avatarUrl} alt={profile.username} />
                  : <span>{initials}</span>
                }
                {uploading && (
                  <div className="avatar-uploading">
                    <span className="mini-spinner" />
                  </div>
                )}
              </div>
              <button
                className="avatar-edit-btn"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change avatar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            {/* ── Name & date ── */}
            <div className="profile-name">{profile.username}</div>
            {joined && <div className="profile-joined">Member since {joined}</div>}

            {/* ── Stats card ── */}
            <div className="profile-card">
              <div className="profile-card-row">
                <span className="card-label">Account</span>
                <span className="card-value">Standard</span>
              </div>
              <div className="profile-card-divider" />
              <div className="profile-card-row">
                <span className="card-label">User ID</span>
                <span className="card-value mono">#{profile.id}</span>
              </div>
            </div>

            {/* ── Sign out ── */}
            <button className="profile-action-btn danger" onClick={onLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        ) : (
          <div className="panel-loading">
            <span style={{ color: 'var(--hint)' }}>Could not load profile</span>
          </div>
        )}
      </div>
    </>
  );
}