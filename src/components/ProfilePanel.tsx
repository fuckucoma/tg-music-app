import { useEffect, useRef, useState } from 'react';
import { BASE_URL, getToken } from '../api/tracks';

interface UserProfile {
  id:              number;
  username:        string | null;
  telegramName:    string | null;
  telegramId:      string | null;
  displayName:     string;         // computed by server: telegramName ?? username ?? fallback
  profileImageUrl: string | null;
  createdAt:       string;
  isAdmin:         boolean;
}

interface Props {
  open:                boolean;
  onClose:             () => void;
  onLogout:            () => void;
  onAvatarChange?:     (url: string) => void;
  onDisplayNameChange?:(name: string) => void;  // keeps header avatar label in sync
}

const toHttps = (url: string) => url.replace(/^http:\/\//, 'https://');

export function ProfilePanel({ open, onClose, onLogout, onAvatarChange, onDisplayNameChange }: Props) {
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [loadErr, setLoadErr]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setLoadErr(false);
    fetch(`${BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setProfile(d);
        const safe = d.profileImageUrl ? toHttps(d.profileImageUrl) : null;
        setAvatarUrl(safe);
        if (safe) onAvatarChange?.(safe);
        // Sync header display name
        const name = d.displayName ?? d.telegramName ?? d.username ?? '';
        if (name) onDisplayNameChange?.(name);
      })
      .catch(() => { setProfile(null); setLoadErr(true); })
      .finally(() => setLoading(false));
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('profileImage', file);
    try {
      const res  = await fetch(`${BASE_URL}/users/uploadProfileImage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        const safe = toHttps(data.profileImageUrl);
        setAvatarUrl(safe);
        onAvatarChange?.(safe);
      }
    } catch {} finally { setUploading(false); }
  };

  // Best display name: Telegram name → username → fallback
  const displayName = profile?.displayName ?? profile?.telegramName ?? profile?.username ?? 'User';
  const initials    = displayName.slice(0, 2).toUpperCase();
  const isTelegram  = !!profile?.telegramId;

  const joined = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[199] transition-all duration-300 ${
          open ? 'bg-black/60 backdrop-blur-sm pointer-events-auto' : 'bg-transparent pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[200] h-[85vh] bg-bg rounded-t-3xl border-t border-[var(--border)] flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-pointer" onClick={onClose}>
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="w-6 h-6 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-safe flex flex-col gap-4 pt-4">

            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-accent text-accent-fg flex items-center justify-center text-3xl font-semibold overflow-hidden shadow-xl">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <span>{initials}</span>
                  }
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-surface border-2 border-bg flex items-center justify-center text-text active:opacity-60 shadow-md"
                  onClick={() => fileRef.current?.click()}
                >
                  <EditIcon />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>

              {loadErr ? (
                <div className="text-center">
                  <p className="text-text font-semibold">Offline</p>
                  <p className="text-muted text-sm">Could not reach server</p>
                </div>
              ) : profile ? (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <h2 className="text-2xl font-semibold text-text">{displayName}</h2>
                    {isTelegram && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#229ED9]/20 text-[#229ED9]">
                        TG
                      </span>
                    )}
                  </div>
                  {profile.username && profile.telegramName && profile.username !== displayName && (
                    <p className="text-[12px] text-muted mt-0.5 font-mono">@{profile.username}</p>
                  )}
                  {joined && (
                    <p className="text-[13px] text-muted font-mono mt-0.5">Member since {joined}</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* Info card */}
            {profile && (
              <div className="rounded-2xl bg-surface border border-[var(--border)] overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3.5">
                  <span className="text-[14px] text-muted">Account</span>
                  <div className="flex items-center gap-1.5">
                    {isTelegram && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#229ED9]/15 text-[#229ED9] font-semibold">
                        Telegram
                      </span>
                    )}
                    <span className="text-[14px] text-text font-medium">
                      {profile.isAdmin ? 'Admin' : 'Standard'}
                    </span>
                  </div>
                </div>
                <div className="h-px bg-[var(--border)] mx-4" />
                <div className="flex justify-between items-center px-4 py-3.5">
                  <span className="text-[14px] text-muted">User ID</span>
                  <span className="text-[14px] text-text font-mono">#{profile.id}</span>
                </div>
                {profile.telegramId && (
                  <>
                    <div className="h-px bg-[var(--border)] mx-4" />
                    <div className="flex justify-between items-center px-4 py-3.5">
                      <span className="text-[14px] text-muted">Telegram ID</span>
                      <span className="text-[14px] text-text font-mono">{profile.telegramId}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Sign out — always visible even if profile failed to load */}
            <button
              className="w-full h-12 rounded-2xl border border-danger/25 text-danger font-medium text-[15px] flex items-center justify-center gap-2.5 active:bg-danger/10 transition-colors mt-auto"
              onClick={onLogout}
            >
              <SignOutIcon />
              Sign out
            </button>

          </div>
        )}
      </div>
    </>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16,17 21,12 16,7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}