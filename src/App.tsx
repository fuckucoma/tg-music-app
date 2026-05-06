import { useCallback, useEffect, useRef, useState } from 'react';
import { getTracks, searchTracks, getToken, clearToken, BASE_URL } from './api/tracks';
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
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  // add state
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(null);
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

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const handleLoginSuccess = useCallback(() => {
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(async () => {
    haptic.tap();
    setProfileOpen(false);
    await fetch(`${BASE_URL}/users/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
    clearToken();
    setTracks([]);
    setAuthed(false);
  }, [haptic]);

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
          {/* Avatar button — opens profile panel */}
          <button className="avatar-btn" onClick={handleAvatarClick} aria-label="Profile">
            {headerAvatar
            ? <img src={headerAvatar} alt="avatar" />
            : <span className="avatar-initials">Me</span>
            }
        </button>
        </div>
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

      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
        onAvatarChange={setHeaderAvatar}
      />
    </div>
  );
}