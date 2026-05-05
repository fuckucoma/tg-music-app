import { useCallback, useEffect, useRef, useState } from 'react';
import { getTracks, searchTracks, getToken, clearToken, BASE_URL } from './api/tracks';
import { SearchBar } from './components/SearchBar';
import { TrackItem } from './components/TrackItem';
import { MiniPlayer } from './components/MiniPlayer';
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
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Apply Telegram theme as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bgColor);
    root.style.setProperty('--bg2', theme.secondaryBgColor);
    root.style.setProperty('--text', theme.textColor);
    root.style.setProperty('--hint', theme.hintColor);
    root.style.setProperty('--accent', theme.buttonColor);
    root.style.setProperty('--accent-text', theme.buttonTextColor);
  }, [theme]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTracks();
      setTracks(data);
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

  // Load tracks whenever authed becomes true
  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const handleLoginSuccess = useCallback(() => {
    setAuthed(true);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setSearching(true);
    try {
      const data = await searchTracks(q);
      setTracks(data);
    } catch {
      // keep existing list
    } finally {
      setSearching(false);
    }
  }, []);

  const handlePlay = useCallback((track: Track) => {
    haptic.tap();
    player.play(track);
  }, [player, haptic]);

  const handlePlayPause = useCallback(() => {
    if (!player.currentTrack) return;
    player.play(player.currentTrack);
  }, [player]);

  // ── Auth gate — AFTER all hooks ──────────────────────────
  if (!authed) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  const handleLogout = useCallback(async () => {
  haptic.tap();
  await fetch(`${BASE_URL}/users/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  }).catch(() => {}); // fire and forget
  clearToken();
  setAuthed(false);
  setTracks([]);
}, [haptic]);

  return (
    <div className="app">
      <div className="header">
        <h1>Music <span>♪</span></h1>
        <button className="logout-btn" onClick={handleLogout} aria-label="Logout">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
        <SearchBar onSearch={handleSearch} loading={searching} />
      </div>

      <div className="track-list-container" ref={listRef}>
        {loading ? (
          <div className="state-msg">
            <span className="icon">🎵</span>
            <span>Loading tracks…</span>
          </div>
        ) : error ? (
          <div className="state-msg">
            <span className="icon">⚠️</span>
            <span>{error}</span>
            <button className="retry-btn" onClick={load}>Retry</button>
          </div>
        ) : tracks.length === 0 ? (
          <div className="state-msg">
            <span className="icon">🔍</span>
            <span>{query ? `No results for "${query}"` : 'No tracks found'}</span>
          </div>
        ) : (
          tracks.map((track) => (
            <TrackItem
              key={track.id}
              track={track}
              isActive={player.currentTrack?.id === track.id}
              status={player.currentTrack?.id === track.id ? player.status : 'idle'}
              onPlay={handlePlay}
            />
          ))
        )}
      </div>

      {player.currentTrack && (
        <MiniPlayer
          track={player.currentTrack}
          status={player.status}
          progress={player.progress}
          onPlayPause={handlePlayPause}
          onSeek={player.seek}
        />
      )}
    </div>
  );
}