import { useCallback, useEffect, useRef, useState } from 'react';
import { getTracks, searchTracks, getToken, clearToken, BASE_URL, getFavorites, toggleFavoriteApi } from './api/tracks';
import { SearchBar } from './components/SearchBar';
import { TrackItem } from './components/TrackItem';
import { MiniPlayer } from './components/MiniPlayer';
import { ProfilePanel } from './components/ProfilePanel';
import { usePlayer } from './hooks/usePlayer';
import { useTelegram } from './hooks/useTelegram';
import { LoginScreen } from './components/LoginScreen';
import type { Track } from './types/track';
import './styles/global.css';

export default function App() {
  const { theme, haptic } = useTelegram();
  const player = usePlayer();

  const [authed, setAuthed] = useState(() => !!getToken());
  const [tracks, setTracks] = useState<Track[]>([]);

  const [tab, setTab] = useState<'all' | 'favorites'>('all');
  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(() =>
    localStorage.getItem('tg_music_avatar') || null
  );

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bgColor);
    root.style.setProperty('--bg2', theme.secondaryBgColor);
    root.style.setProperty('--text', theme.textColor);
    root.style.setProperty('--hint', theme.hintColor);
    root.style.setProperty('--accent', theme.buttonColor);
    root.style.setProperty('--accent-text', theme.buttonTextColor);
  }, [theme]);

  // ✅ FIXED normalizeFavorites
  const normalizeFavorites = (favs: any[]): Track[] => {
    return favs.map(f => ({
      id: Number(f.trackId), // 🔥 ВАЖНО
      title: f.title,
      artist: f.artist,
      coverUrl: f.imageUrl,
      filename: f.filename,
      duration: f.duration || 0,
      album: f.album || '',
      streamUrl: `${BASE_URL}/tracks/${f.trackId}/stream`
    }));
  };

  const load = useCallback(async () => {
  setLoading(true);
  setError(null);

  try {
    const tracksData = await getTracks();
    setTracks(tracksData);

    let favsData = { favorites: [] };

    try {
      favsData = await getFavorites(); // ✅ теперь ок
    } catch {
      console.warn('Favorites failed, ignoring');
    }

    const favs = favsData.favorites || [];
    setFavoriteTracks(normalizeFavorites(favs));
    setFavoriteIds(new Set(favs.map((f: any) => Number(f.trackId))));

  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      setAuthed(false);
      return;
    }
    setError('Could not load tracks.');
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const handleLoginSuccess = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();

      if (data.profileImageUrl) {
        const safe = data.profileImageUrl.replace(/^http:\/\//, 'https://');
        setHeaderAvatar(safe);
        localStorage.setItem('tg_music_avatar', safe);
      }
    } catch {}

    setAuthed(true);
  }, []);

  const handleToggleFavorite = useCallback(async (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();

    const id = Number(track.id); // 🔥 FIX
    const isFav = favoriteIds.has(id);

    // оптимистичный апдейт
    setFavoriteIds(prev => {
      const next = new Set(prev);
      isFav ? next.delete(id) : next.add(id);
      return next;
    });

    try {
      await toggleFavoriteApi(id, isFav);

      const favsData = await getFavorites();
      setFavoriteTracks(normalizeFavorites(favsData.favorites || []));

    } catch {
      // откат
      setFavoriteIds(prev => {
        const next = new Set(prev);
        isFav ? next.add(id) : next.delete(id);
        return next;
      });
    }
  }, [favoriteIds, haptic]);

  const displayedTracks = tab === 'favorites' ? favoriteTracks : tracks;

  const handleAvatarChange = useCallback((url: string) => {
    const safe = url.replace(/^http:\/\//, 'https://');
    setHeaderAvatar(safe);
    localStorage.setItem('tg_music_avatar', safe);
  }, []);

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
    setTracks([]);
    setFavoriteTracks([]);
    setFavoriteIds(new Set());
    setAuthed(false);
  }, [haptic]);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setSearching(true);

    try {
      const data = await searchTracks(q);
      setTracks(data);
    } catch {}

    setSearching(false);
  }, []);

  const handlePlay = useCallback((track: Track) => {
    haptic.tap();
    player.play(track, displayedTracks);
  }, [player, haptic, displayedTracks]);

  const handlePlayPause = useCallback(() => {
    if (!player.currentTrack) return;
    player.play(player.currentTrack);
  }, [player]);

  const handleAvatarClick = useCallback(() => {
    haptic.tap();
    setProfileOpen(true);
  }, [haptic]);

  if (!authed) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-row">
          <h1>Music <span>♪</span></h1>

          <button className="avatar-btn" onClick={handleAvatarClick}>
            {headerAvatar
              ? <img src={headerAvatar} alt="avatar" />
              : <span className="avatar-initials">Me</span>
            }
          </button>
        </div>

        <SearchBar onSearch={handleSearch} loading={searching} />
      </div>

      <div className="app-tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          All Tracks
        </button>

        <button className={tab === 'favorites' ? 'active' : ''} onClick={() => setTab('favorites')}>
          Favorites
        </button>
      </div>

      <div className="track-list-container" ref={listRef}>
        {loading ? (
          <div className="state-msg">Loading…</div>
        ) : error ? (
          <div className="state-msg">{error}</div>
        ) : displayedTracks.length === 0 ? (
          <div className="state-msg">
            {tab === 'favorites'
              ? "No favorites yet"
              : (query ? `No results for "${query}"` : 'No tracks')}
          </div>
        ) : (
          displayedTracks.map(track => (
            <TrackItem
              key={track.id}
              track={track}
              isActive={player.currentTrack?.id === track.id}
              status={player.currentTrack?.id === track.id ? player.status : 'idle'}
              isFavorite={favoriteIds.has(Number(track.id))} // 🔥 FIX
              onPlay={handlePlay}
              onToggleFavorite={handleToggleFavorite}
            />
          ))
        )}
      </div>

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

      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
        onAvatarChange={handleAvatarChange}
      />
    </div>
  );
}