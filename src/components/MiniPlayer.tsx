import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';

interface Props {
  track: Track;
  status: PlayerStatus;
  progress: number;          // 0–1
  onPlayPause: () => void;
  onSeek: (ratio: number) => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MiniPlayer({ track, status, progress, onPlayPause, onSeek }: Props) {
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, ratio)));
  };

  return (
    <div className="mini-player">
      {/* Progress bar — tap anywhere to seek */}
      <div className="progress-track" onClick={handleProgressClick} role="slider" aria-valuenow={Math.round(progress * 100)}>
        <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="player-body">
        {/* Cover */}
        <div className="player-cover">
          {track.coverUrl
            ? <img src={track.coverUrl} alt={track.title} />
            : <span>♪</span>
          }
        </div>

        {/* Info */}
        <div className="player-info">
          <span className="player-title">{track.title}</span>
          <span className="player-artist">{track.artist}</span>
        </div>

        {/* Controls */}
        <button className="play-btn" onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isLoading
            ? <span className="btn-spinner" />
            : isPlaying
              ? <PauseIcon />
              : <PlayIcon />
          }
        </button>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
}
