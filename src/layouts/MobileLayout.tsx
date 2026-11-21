import { AccountDialog } from '../features/auth/AccountDialog';
import { MiniPlayer } from '../components/MiniPlayer';
import { Icon } from '../components/Controls';
import { PlaybackDevices, PlaybackSessionNotice } from '../components/PlaybackDevices';
import { ProfilePanel } from '../components/ProfilePanel';
import { SearchBar } from '../components/SearchBar';
import { TrackRow } from '../components/TrackRow';
import { TrackPageControls } from '../components/TrackPageControls';
import { usePlayer } from '../features/player/PlayerProvider';
import { useState } from 'react';
import type { LayoutProps } from './AppShell';

export default function MobileLayout({ auth, favorites, library, search, hapticTap }: LayoutProps) {
  const player = usePlayer();
  const [tab, setTab] = useState<'all' | 'favorites' | 'queue'>('all');
  const profile = auth.profile;
  const displayName = profile?.displayName || profile?.telegramName || profile?.username || '';
  const favoriteTab = tab === 'favorites';
  const queueTab = tab === 'queue';
  const query = search.query.trim();
  const rows = queueTab ? player.queue : favoriteTab ? favorites.favorites : search.tracks;
  const loading = !queueTab && (favoriteTab ? favorites.favoritesLoading : query ? search.loading : library.loading);
  const error = queueTab ? '' : favoriteTab ? favorites.favoritesError : query ? search.error : library.error;
  const retry = favoriteTab ? favorites.reloadFavorites : query ? search.retry : library.reload;
  const current = player.currentTrack;
  const remoteAudio = player.mode === 'remote' && Boolean(player.activeDeviceId);
  const outputName = remoteAudio
    ? player.devices.find((device) => device.id === player.activeDeviceId)?.name
    : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <header className="flex-shrink-0 px-4 pb-0 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-[28px] font-semibold tracking-tight text-text">
            {queueTab ? 'Queue' : favoriteTab ? 'Favorites' : 'Music'}
          </h1>
          <div className="flex items-center gap-2">
            <PlaybackDevices language="en" />
            <button
              type="button"
              aria-label={profile ? 'Open profile' : 'Sign in'}
              disabled={auth.status === 'checking'}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-fg ring-2 ring-[var(--border)] active:opacity-70"
              onClick={() => { hapticTap(); auth.openAuth(); }}
            >
              {profile?.profileImageUrl
                ? <img src={profile.profileImageUrl} alt="" className="h-full w-full object-cover" />
                : <span className="text-[11px] font-bold">{displayName.slice(0, 2).toUpperCase() || 'Me'}</span>}
            </button>
          </div>
        </div>
        {tab === 'all' && (
          <SearchBar variant="mobile" value={search.query} onChange={search.setQuery} loading={search.loading} />
        )}
        <PlaybackSessionNotice language="en" />
      </header>

      {(auth.notice || favorites.notice || auth.status === 'unavailable') && (
        <div role="status" className="flex justify-between px-4 py-2 text-sm text-muted">
          {auth.notice || favorites.notice || 'Could not verify your session.'}
          {auth.status === 'unavailable' && <button onClick={auth.retry}>Retry</button>}
          {(auth.notice || favorites.notice) && (
            <button type="button" className="px-2" aria-label="Dismiss" onClick={() => {
              auth.clearNotice();
              favorites.clearNotice();
            }}>×</button>
          )}
        </div>
      )}

      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(60px + 56px + env(safe-area-inset-bottom) + 8px)' }}
      >
        {favoriteTab && !profile ? (
          <div className="flex flex-col items-center gap-4 py-20 text-sm text-muted">
            <p>Sign in to see your favorites.</p>
            <button className="rounded-2xl bg-accent px-5 py-2 text-accent-fg" onClick={auth.openAuth}>
              Sign in
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted" role="status">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted/30 border-t-muted" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted" role="alert">
            <span>{error}</span>
            <button className="rounded-2xl bg-accent px-5 py-2 text-accent-fg" onClick={retry}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-muted">
            <span className="text-[17px] font-semibold text-text">
              {queueTab ? 'Queue is empty' : favoriteTab ? 'No favorites yet' : query ? 'No results' : 'No tracks'}
            </span>
            {favoriteTab && <p className="px-8 text-center text-sm">Tap ♡ on any track to save it here</p>}
          </div>
        ) : (
          <div className="pt-1">
            {rows.map((track) => (
              <TrackRow
                key={track.id}
                variant="mobile"
                track={track}
                isActive={current?.id === track.id}
                status={track.id === player.pendingPlayTrackId ? 'loading' : current?.id === track.id ? player.status : 'idle'}
                isFavorite={favorites.favoriteIds.has(track.id)}
                favoritePending={favorites.pendingIds.has(track.id) || !favorites.canToggle}
                onPlay={() => { hapticTap(); player.play(track, rows); }}
                onToggleFavorite={() => { hapticTap(); void favorites.toggleFavorite(track); }}
              />
            ))}
          </div>
        )}
        {tab === 'all' && !error && !loading && (
          <TrackPageControls page={query ? search : library} language="en" />
        )}
      </main>

      {current && (
        <MiniPlayer
          track={current}
          status={current.id === player.pendingPlayTrackId ? 'loading' : player.status}
          duration={player.duration}
          volume={player.volume}
          shuffle={player.shuffle}
          repeat={player.repeat}
          remoteAudio={remoteAudio}
          outputName={outputName}
          onPlayPause={() => player.play(current)}
          onSeek={player.seek}
          onNext={player.playNext}
          onPrev={player.playPrev}
          onChangeVolume={player.changeVolume}
          onToggleShuffle={player.toggleShuffle}
          onCycleRepeat={player.cycleRepeat}
        />
      )}

      <nav
        aria-label="Music navigation"
        className="fixed bottom-0 left-0 right-0 z-[101] flex border-t border-[var(--border)] bg-surface/95 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', height: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <TabBtn icon={<HomeIcon active={tab === 'all'} />} label="Music" active={tab === 'all'}
          onClick={() => { hapticTap(); setTab('all'); }} />
        <TabBtn icon={<HeartTabIcon active={favoriteTab} count={favorites.favoriteIds.size} />}
          label="Favorites" active={favoriteTab} onClick={() => { hapticTap(); setTab('favorites'); }} />
        <TabBtn icon={<Icon name="queue" size={22} />} label="Queue" active={queueTab}
          onClick={() => { hapticTap(); setTab('queue'); }} />
      </nav>

      {profile ? (
        <ProfilePanel
          open={auth.authOpen}
          profile={profile}
          onClose={auth.closeAuth}
          onLogout={auth.logout}
          onUploadAvatar={auth.uploadAvatar}
        />
      ) : (
        <AccountDialog
          open={auth.authOpen}
          profile={null}
          onClose={auth.closeAuth}
          onLogout={auth.logout}
          onUploadAvatar={auth.uploadAvatar}
          onCredentials={auth.acceptCredentials}
        />
      )}
    </div>
  );
}


function TabBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
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
