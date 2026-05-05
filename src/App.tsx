import { useCallback, useEffect, useRef, useState } from 'react';
import { getTracks, searchTracks } from './api/tracks';
import { SearchBar } from './components/SearchBar';
import { TrackItem } from './components/TrackItem';
import { MiniPlayer } from './components/MiniPlayer';
import { usePlayer } from './hooks/usePlayer';
import { useTelegram } from './hooks/useTelegram';
import { LoginScreen } from './components/LoginScreen';
import { getToken, clearToken } from './api/tracks';
import type { Track } from './types/track';
import './styles/global.css';

export default function App() {
  const { theme, haptic } = useTelegram();
  const player = usePlayer();

  const [authed, setAuthed] = useState(() => !!getToken());

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  if (!authed) {
  return <LoginScreen onSuccess={() => setAuthed(true)} />;}

  // Initial load
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTracks();
      setTracks(data);
    } catch (e:any) { if (e.message === 'UNAUTHORIZED') {
    setAuthed(false);  // kicks back to login screen
    return;
  }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Search with debounce (handled inside SearchBar)
  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setSearching(true);
    try {
      const data = await searchTracks(q);
      setTracks(data);
    } catch {
      // silently keep existing list on search error
    } finally {
      setSearching(false);
    }
  }, []);

  const handlePlay = useCallback(
    (track: Track) => {
      haptic.tap();
      player.play(track);
    },
    [player, haptic],
  );

  const handlePlayPause = useCallback(() => {
    if (!player.currentTrack) return;
    player.play(player.currentTrack);
  }, [player]);

  // Staggered animation delay for list items
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="app">
      {/* ── Header ── */}
      <div className="header">
        <h1>Music <span>♪</span></h1>
        <SearchBar onSearch={handleSearch} loading={searching} />
      </div>

      {/* ── Track list ── */}
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
          tracks.map((track, i) => (
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

      {/* ── Sticky player ── */}
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
