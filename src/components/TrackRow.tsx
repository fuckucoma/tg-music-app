import { Icon, IconButton, time } from './Controls';
import { TrackArtwork } from './TrackArtwork';
import type { PlayerStatus, Track } from '../types/track';

type Props = {
  variant: 'mobile' | 'desktop';
  track: Track;
  isActive: boolean;
  status: PlayerStatus;
  isFavorite: boolean;
  favoritePending?: boolean;
  index?: number;
  onPlay: (track: Track) => void;
  onToggleFavorite: (track: Track) => void;
};

export function TrackRow({
  variant, track, isActive, status, isFavorite, favoritePending, index, onPlay, onToggleFavorite,
}: Props) {
  const isPlaying = isActive && status === 'playing';
  const isLoading = status === 'loading';
  const title = `${track.title} — ${track.artist}`;
  const playLabel = `${isPlaying ? 'Приостановить' : 'Слушать'} ${title}`;
  const favoriteLabel = `${isFavorite ? 'Убрать из избранного' : 'В избранное'}: ${track.title}`;
  const duration = track.duration ? time(track.duration) : undefined;

  if (variant === 'desktop') {
    return (
      <div className={`du-trackrow${isActive ? ' active' : ''}`} role="listitem">
        <button type="button" className="du-trackpick" aria-label={playLabel} aria-busy={isLoading || undefined}
          onClick={() => onPlay(track)}>
          <span className="du-num" aria-hidden="true">
            {isLoading
              ? <span className="inline-block h-3 w-3 animate-spin-slow rounded-full border-2 border-current border-t-transparent" />
              : isPlaying ? <b>♫</b> : index === undefined ? null : String(index + 1).padStart(2, '0')}
          </span>
          <TrackArtwork track={track} />
          <span className="min-w-0">
            <strong className="block truncate">{track.title}</strong>
            <small className="block truncate">{track.artist}</small>
          </span>
        </button>
        <span className="du-album truncate">{track.album || '—'}</span>
        <span className="du-duration">{duration ?? '—'}</span>
        <IconButton icon="heart" size={18} className={isFavorite ? 'du-liked' : ''}
          aria-pressed={isFavorite} disabled={favoritePending} label={favoriteLabel}
          onClick={() => onToggleFavorite(track)} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 px-4 py-2.5 shadow-xl/20 transition-colors animate-fade-up ${isActive ? 'bg-surface/40' : ''}`}>
      <button type="button" aria-label={playLabel} aria-busy={isLoading || undefined}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left active:bg-surface/60"
        onClick={() => onPlay(track)}>
        <TrackArtwork track={track} variant="mobile" className="h-12 w-12 rounded-xl hover:opacity-80">
          {(isActive || isLoading) && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              {isLoading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
                : <Icon name={isPlaying ? 'pause' : 'play'} size={16} />}
            </span>
          )}
        </TrackArtwork>
        <span className="flex-1 min-w-0">
          <span className={`block truncate text-[15px] font-medium transition-colors ${isActive ? 'text-accent' : 'text-text'}`}>
            {track.title}
          </span>
          <span className="block truncate text-[13px] text-muted font-mono">
            {track.artist}{track.album ? ` — ${track.album}` : ''}
          </span>
        </span>
        {isPlaying ? (
          <span className="flex items-end gap-[2px] h-4 mr-1" aria-hidden="true">
            <span className="h-2 w-[3px] bg-accent rounded-sm origin-bottom animate-eq1" />
            <span className="h-3.5 w-[3px] bg-accent rounded-sm origin-bottom animate-eq2" />
            <span className="h-1.5 w-[3px] bg-accent rounded-sm origin-bottom animate-eq3" />
          </span>
        ) : duration && (
          <span className="text-[11px] text-muted font-mono">{duration}</span>
        )}
      </button>
      <button type="button" aria-label={favoriteLabel} aria-pressed={isFavorite} disabled={favoritePending}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform active:scale-90 disabled:opacity-50 ${isFavorite ? 'text-[#ff4d4d] [&_svg]:fill-current' : 'text-muted'}`}
        onClick={() => onToggleFavorite(track)}>
        <Icon name="heart" size={18} />
      </button>
    </div>
  );
}
