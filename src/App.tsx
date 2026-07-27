import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTracks, searchTracks,
  getToken, clearToken, BASE_URL,
  getFavorites, toggleFavoriteApi,
  authWithTelegram,
} from './api/tracks';
import { SearchBar }    from './components/SearchBar';
import { TrackItem }    from './components/TrackItem';
import { MiniPlayer }   from './components/MiniPlayer';
import { ProfilePanel } from './components/ProfilePanel';
import { usePlayer }    from './hooks/usePlayer';
import { useTelegram }  from './hooks/useTelegram';
import { LoginScreen }  from './components/LoginScreen';
import type { Track }   from './types/track';
import { supabase }     from './lib/supabase';

type Tab       = 'all' | 'favorites';
type AuthState = 'checking' | 'authed' | 'needs-login';

export default function App() {
  const { haptic, tg } = useTelegram();
  const player         = usePlayer();

  const [authState, setAuthState]       = useState<AuthState>('checking');
  const [tracks, setTracks]             = useState<Track[]>([]);
  const [favTracks, setFavTracks]       = useState<Track[]>([]);
  const [favoriteIds, setFavoriteIds]   = useState<Set<number>>(new Set());
  const [tab, setTab]                   = useState<Tab>('all');
  const [loading, setLoading]           = useState(false);
  const [searching, setSearching]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [query, setQuery]               = useState('');
  const [profileOpen, setProfileOpen]   = useState(false);
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(
    () => localStorage.getItem('tg_music_avatar') || null
  );
  const [displayName, setDisplayName]   = useState<string>('');
  const listRef = useRef<HTMLDivElement>(null);

  // ── 1. Auth on mount ─────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Already have a token — go straight in
      if (getToken()) {
        setAuthState('authed');
        return;
      }

      // Try Telegram initData auth (works inside Mini App)
      const initData = tg?.initData;
      if (initData) {
        try {
          const result = await authWithTelegram(initData);
          setDisplayName(result.user.username ?? '');
          if (result.user.profileImageUrl) {
            const safe = result.user.profileImageUrl.replace(/^http:\/\//, 'https://');
            setHeaderAvatar(safe);
            localStorage.setItem('tg_music_avatar', safe);
          }
          setAuthState('authed');
          return;
        } catch (e) {
          console.warn('[Auth] Telegram auth failed, falling back:', e);
        }
      }

      // No token and no initData — show login screen
      setAuthState('needs-login');
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // runs once on mount — tg ref is stable

  // ── Normalize favorites ───────────────────────────────────
  const normalizeFavs = useCallback((favs: any[]): Track[] =>
    favs.map(f => ({
      id:        Number(f.trackId),
      title:     f.title  ?? 'Unknown',
      artist:    f.artist ?? 'Unknown',
      coverUrl:  f.imageUrl?.replace(/^http:\/\//, 'https://') ?? undefined,
      streamUrl: `${BASE_URL}/tracks/${f.trackId}/stream`,
      album:     f.album ?? undefined,
    })), []);

  // ── 2. Load data once authed ──────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tracksRes, favsRes] = await Promise.allSettled([
        getTracks(),
        getFavorites(),
      ]);
      if (tracksRes.status === 'fulfilled') {
        setTracks(tracksRes.value);
      } else {
        throw (tracksRes as PromiseRejectedResult).reason;
      }
      if (favsRes.status === 'fulfilled') {
        const favs = favsRes.value?.favorites ?? [];
        setFavTracks(normalizeFavs(favs));
        setFavoriteIds(new Set(favs.map((f: any) => Number(f.trackId))));
      }
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') { setAuthState('needs-login'); return; }
      setError('Could not load tracks.');
    } finally {
      setLoading(false);
    }
  }, [normalizeFavs]);

  useEffect(() => {
    if (authState === 'authed') load();
  }, [authState, load]);

  // ── 3. Realtime — new track inserted via bot ──────────────
  useEffect(() => {
    if (authState !== 'authed') return;
    const channel = supabase
      .channel('tracks-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Track' },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authState, load]);

  // ── Classic login success (fallback flow) ─────────────────
  const handleLoginSuccess = useCallback(async () => {
    try {
      const res  = await fetch(`${BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      const name = data.displayName ?? data.telegramName ?? data.username ?? '';
      setDisplayName(name);
      if (data.profileImageUrl) {
        const safe = data.profileImageUrl.replace(/^http:\/\//, 'https://');
        setHeaderAvatar(safe);
        localStorage.setItem('tg_music_avatar', safe);
      }
    } catch {}
    setAuthState('authed');
  }, []);

  // ── Logout ────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    haptic.tap();
    setProfileOpen(false);
    await fetch(`${BASE_URL}/users/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
    clearToken();
    localStorage.removeItem('tg_music_avatar');
    setHeaderAvatar(null);
    setDisplayName('');
    setTracks([]);
    setFavTracks([]);
    setFavoriteIds(new Set());
    setAuthState('needs-login');
  }, [haptic]);

  // ── Favorites ─────────────────────────────────────────────
  const handleToggleFavorite = useCallback(async (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();
    const id    = Number(track.id);
    const isFav = favoriteIds.has(id);

    // Optimistic update
    setFavoriteIds(prev => {
      const n = new Set(prev);
      isFav ? n.delete(id) : n.add(id);
      return n;
    });

    try {
      await toggleFavoriteApi(id, isFav);
      const data = await getFavorites();
      const favs = data?.favorites ?? [];
      setFavTracks(normalizeFavs(favs));
      setFavoriteIds(new Set(favs.map((f: any) => Number(f.trackId))));
    } catch {
      // Revert on failure
      setFavoriteIds(prev => {
        const n = new Set(prev);
        isFav ? n.add(id) : n.delete(id);
        return n;
      });
    }
  }, [favoriteIds, haptic, normalizeFavs]);

  // ── Search ────────────────────────────────────────────────
  const handleSearch = useCallback(async (q: string) => {
    setQuery(q); setSearching(true);
    try { setTracks(await searchTracks(q)); } catch {}
    finally { setSearching(false); }
  }, []);

  // ── Player ────────────────────────────────────────────────
  const displayed       = tab === 'favorites' ? favTracks : tracks;
  const handlePlay      = useCallback((track: Track) => { haptic.tap(); player.play(track, displayed); }, [player, haptic, displayed]);
  const handlePlayPause = useCallback(() => { if (player.currentTrack) player.play(player.currentTrack); }, [player]);

  // ── Render ────────────────────────────────────────────────

  // Checking — show spinner, avoids flash of login screen
  if (authState === 'checking') {
    return (
      <div className="flex items-center justify-center h-full bg-bg">
        <div className="w-8 h-8 border-2 border-[var(--border)] border-t-muted rounded-full animate-spin" />
      </div>
    );
  }

  // Needs login — fallback for browser / non-Telegram
  if (authState === 'needs-login') {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  const avatarLabel = displayName?.slice(0, 2).toUpperCase() || 'Me';

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[28px] font-semibold text-text tracking-tight">
            {tab === 'all' ? 'Music' : 'Favorites'}
          </h1>
          <button
            className="w-9 h-9 rounded-full bg-accent text-accent-fg flex items-center justify-center overflow-hidden active:opacity-70 transition-opacity ring-2 ring-[var(--border)]"
            onClick={() => { haptic.tap(); setProfileOpen(true); }}
          >
            {headerAvatar
              ? <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
              : <span className="text-[11px] font-bold">{avatarLabel}</span>
            }
          </button>
        </div>
        {tab === 'all' && <SearchBar onSearch={handleSearch} loading={searching} />}
      </div>

      {/* ── Track list ── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: `calc(60px + 56px + env(safe-area-inset-bottom) + 8px)` }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
            <span className="w-7 h-7 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted text-sm">
            <span className="text-4xl">⚠️</span>
            <span>{error}</span>
            <button
              className="px-5 py-2 rounded-2xl bg-accent text-accent-fg text-[13px] font-medium"
              onClick={load}
            >
              Retry
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted">
            <span className="text-5xl">{tab === 'favorites' ? '🤍' : '🔍'}</span>
            <span className="text-[17px] font-semibold text-text mt-1">
              {tab === 'favorites'
                ? 'No favorites yet'
                : query ? `No results for "${query}"` : 'No tracks'
              }
            </span>
            <span className="text-sm text-center px-8">
              {tab === 'favorites' ? 'Tap ♡ on any track to save it here' : ''}
            </span>
          </div>
        ) : (
          <div className="pt-1">
            {displayed.map((track, i) => (
              <div key={track.id} style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}>
                <TrackItem
                  track={track}
                  isActive={player.currentTrack?.id === track.id}
                  status={player.currentTrack?.id === track.id ? player.status : 'idle'}
                  isFavorite={favoriteIds.has(Number(track.id))}
                  onPlay={handlePlay}
                  onToggleFavorite={handleToggleFavorite}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Mini player ── */}
      {player.currentTrack && (
        <MiniPlayer
          track={player.currentTrack}
          status={player.status}
          progress={player.progress}
          duration={player.duration}
          volume={player.volume}
          shuffle={player.shuffle}
          repeat={player.repeat}
          onPlayPause={handlePlayPause}
          onSeek={player.seek}
          onNext={player.playNext}
          onPrev={player.playPrev}
          onChangeVolume={player.changeVolume}
          onToggleShuffle={player.toggleShuffle}
          onCycleRepeat={player.cycleRepeat}
        />
      )}

      {/* ── Tab bar ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[101] flex bg-surface/95 backdrop-blur-xl border-t border-[var(--border)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', height: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <TabBtn
          icon={<HomeIcon active={tab === 'all'} />}
          label="Music"
          active={tab === 'all'}
          onClick={() => { haptic.tap(); setTab('all'); }}
        />
        <TabBtn
          icon={<HeartTabIcon active={tab === 'favorites'} count={favoriteIds.size} />}
          label="Favorites"
          active={tab === 'favorites'}
          onClick={() => { haptic.tap(); setTab('favorites'); }}
        />
      </div>

      {/* ── Profile panel ── */}
      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
        onAvatarChange={url => {
          const safe = url.replace(/^http:\/\//, 'https://');
          setHeaderAvatar(safe);
          localStorage.setItem('tg_music_avatar', safe);
        }}
        onDisplayNameChange={setDisplayName}
      />
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────

function TabBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-50 ${active ? 'text-text' : 'text-muted'}`}
      onClick={onClick}
    >
      {icon}
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return active
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/></svg>
    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>;
}

function HeartTabIcon({ active, count }: { active: boolean; count: number }) {
  return (
    <div className="relative">
      {active
        ? <svg width="22" height="22" viewBox="0 0 24 24" fill="#ff4d4d" stroke="#ff4d4d" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      }
      {count > 0 && (
        <span className="absolute -top-1 -right-2 bg-[#ff4d4d] text-white text-[9px] font-bold min-w-[15px] h-[15px] rounded-full flex items-center justify-center px-[3px]">
          {count > 99 ? '99' : count}
        </span>
      )}
    </div>
  );
}