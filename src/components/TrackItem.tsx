import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';

interface Props {
  track: Track;
  isActive: boolean;
  status: PlayerStatus;
  isFavorite: boolean;
  onPlay: (track: Track) => void;
  onToggleFavorite: (track: Track, e: React.MouseEvent) => void;
}

function fmt(secs?: number) {
  if (!secs) return '';
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
}

export function TrackItem({ track, isActive, status, isFavorite, onPlay, onToggleFavorite }: Props) {
  const isPlaying = isActive && status === 'playing';
  const isLoading = isActive && status === 'loading';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 shadow-xl/20 cursor-pointer active:bg-surface/60 transition-colors animate-fade-up  ${isActive ? 'bg-surface/40' : ''}`}
      onClick={() => onPlay(track)}
    >
      {/* Cover */}
      <div className="hover:opacity-80 duration-200 relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-surface flex items-center justify-center">
        {track.coverUrl
          ? <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-xl text-muted opacity-50 ">♪</span>
        }
        {/* Overlay on active */}
        {isActive && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            {isLoading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
              : isPlaying
                ? <PauseIcon />
                : <PlayIcon />
            }
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-medium truncate ${isActive ? 'text-accent' : 'text-text'} transition-colors`}>
          {track.title}
        </p>
        <p className="text-[13px] text-muted truncate font-mono">
          {track.artist}{track.album ? ` — ${track.album}` : ''}
        </p>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Equaliser */}
        {isPlaying && (
          <div className="flex items-end gap-[2px] h-4 mr-1">
            <span className="w-[3px] bg-accent rounded-sm origin-bottom animate-eq1" style={{ height: '8px' }} />
            <span className="w-[3px] bg-accent rounded-sm origin-bottom animate-eq2" style={{ height: '14px' }} />
            <span className="w-[3px] bg-accent rounded-sm origin-bottom animate-eq3" style={{ height: '6px' }} />
          </div>
        )}

        {/* Duration */}
        {track.duration && !isPlaying && (
          <span className="text-[11px] text-muted font-mono">{fmt(track.duration)}</span>
        )}

        {/* Heart */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-transform active:scale-90"
          onClick={e => { e.stopPropagation(); onToggleFavorite(track, e); }}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
    </div>
  );
}

function PlayIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>;
}
function PauseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
}
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24"
      fill={filled ? '#ff4d4d' : 'none'}
      stroke={filled ? '#ff4d4d' : 'var(--muted)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}