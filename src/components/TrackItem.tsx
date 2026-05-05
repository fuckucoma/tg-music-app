import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';

interface Props {
  track: Track;
  isActive: boolean;
  status: PlayerStatus;
  onPlay: (track: Track) => void;
}

function formatDuration(secs?: number): string {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackItem({ track, isActive, status, onPlay }: Props) {
  const isPlaying = isActive && status === 'playing';
  const isLoading = isActive && status === 'loading';

  return (
    <button
      className={`track-item ${isActive ? 'active' : ''}`}
      onClick={() => onPlay(track)}
      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
    >
      {/* Cover art */}
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

      {/* Info */}
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}{track.album ? ` — ${track.album}` : ''}</span>
      </div>

      {/* Duration + equaliser */}
      <div className="track-meta">
        {isPlaying && <Equaliser />}
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
      <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
}

function Equaliser() {
  return (
    <span className="equaliser" aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  );
}
