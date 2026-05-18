import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';

interface Props {
  track: Track;
  isActive: boolean;
  status: PlayerStatus;
  isFavorite: boolean; // <-- Новый пропс
  onPlay: (track: Track) => void;
  onToggleFavorite: (track: Track, e: React.MouseEvent) => void; // <-- Новый пропс
}

function formatDuration(secs?: number): string {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackItem({ track, isActive, status, isFavorite, onPlay, onToggleFavorite }: Props) {
  const isPlaying = isActive && status === 'playing';
  const isLoading = isActive && status === 'loading';

  return (
    <button
      className={`track-item ${isActive ? 'active' : ''}`}
      onClick={() => onPlay(track)}
      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
    >
      {/* Обложка трека */}
      <div className="track-cover">
        {track.coverUrl
          ? <img src={track.coverUrl} alt={track.title} loading="lazy" />
          : <span className="cover-placeholder">♪</span>
        }
        <div className="cover-overlay">
          {isLoading
            ? <span className="mini-spinner" />
            : isPlaying
              ? <PauseIcon />
              : <PlayIcon />
          }
        </div>
      </div>

      {/* Информация */}
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}{track.album ? ` — ${track.album}` : ''}</span>
      </div>

      {/* Мета-данные и кнопка лайка */}
      <div className="track-meta">
        {isPlaying && <Equaliser />}
        
        <div 
          className={`fav-btn ${isFavorite ? 'is-fav' : ''}`}
          onClick={(e) => onToggleFavorite(track, e)}
        >
          <HeartIcon filled={isFavorite} />
        </div>

        {track.duration && <span className="track-dur">{formatDuration(track.duration)}</span>}
      </div>
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function Equaliser() {
  return (
    <div className="equaliser">
      <span />
      <span />
      <span />
    </div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "var(--accent)" : "none"} stroke={filled ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  );
}