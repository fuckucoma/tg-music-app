import { useEffect, useState } from 'react';
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
}

export function ProfilePanel({ open, onClose, onLogout }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [open]);

  const joined = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  const initials = profile?.username
    ? profile.username.slice(0, 2).toUpperCase()
    : '?';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`panel-backdrop ${open ? 'visible' : ''}`}
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div className={`profile-panel ${open ? 'open' : ''}`}>
        <div className="panel-handle" />

        {loading ? (
          <div className="panel-loading">
            <span className="search-spinner" />
          </div>
        ) : profile ? (
          <>
            {/* Avatar */}
            <div className="profile-avatar-lg">
              {profile.profileImageUrl
                ? <img src={profile.profileImageUrl} alt={profile.username} />
                : <span>{initials}</span>
              }
            </div>

            {/* Info */}
            <div className="profile-name">{profile.username}</div>
            {joined && <div className="profile-joined">Member since {joined}</div>}

            <div className="profile-divider" />

            {/* Stats row */}
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="stat-icon">🎵</span>
                <span className="stat-label">Music lover</span>
              </div>
            </div>

            <div className="profile-divider" />

            {/* Actions */}
            <button className="profile-action-btn danger" onClick={onLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </>
        ) : (
          <div className="panel-loading">
            <span style={{ color: 'var(--hint)' }}>Could not load profile</span>
          </div>
        )}
      </div>
    </>
  );
}