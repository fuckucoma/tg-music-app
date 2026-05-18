import { useState } from 'react';
import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';
import type { RepeatMode } from '../hooks/usePlayer';


interface Props {
  track: Track;
  status: PlayerStatus;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  onPlayPause: () => void;
  onSeek: (ratio: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onChangeVolume: (v: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

function fmt(secs: number): string {
  if (!secs || !isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MiniPlayer({
  track, status, progress, duration, volume,
  shuffle, repeat,
  onPlayPause, onSeek, onNext, onPrev,
  onChangeVolume, onToggleShuffle, onCycleRepeat,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  
  
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  // Touch seek — tracks finger drag across the bar
  const handleSeekTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0] ?? e.changedTouches[0];
    onSeek(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));
  };

  return (
    <>
      {/* ── Full screen player ── */}
      {expanded && (
        <div className="full-player">
          {/* Blurred cover background */}
          {track.coverUrl && (
            <div
              className="full-player-bg"
              style={{ backgroundImage: `url(${track.coverUrl})` }}
            />
          )}
          <div className="full-player-overlay" />

          {/* Header */}
          <div className="full-player-header">
            <button className="fp-icon-btn" onClick={() => setExpanded(false)} aria-label="Close">
              <ChevronDownIcon />
            </button>
            <span className="fp-now-playing">Now Playing</span>
            <div style={{ width: 40 }} />
          </div>

          {/* Cover art */}
          <div className="fp-cover-wrap">
            <div className={`fp-cover ${isPlaying ? 'playing' : ''}`}>
              {track.coverUrl
                ? <img src={track.coverUrl} alt={track.title} />
                : <span className="fp-cover-placeholder">♪</span>
              }
            </div>
          </div>

          {/* Track info */}
          <div className="fp-info">
            <div className="fp-title">{track.title}</div>
            <div className="fp-artist">{track.artist}</div>
          </div>

          {/* Seekbar */}
          <div className="fp-seek-wrap">
            <div
              className="fp-seek-track"
              onClick={handleSeekClick}
              onTouchStart={handleSeekTouch}
              onTouchMove={handleSeekTouch}
            >
              <div className="fp-seek-fill" style={{ width: `${progress * 100}%` }}>
                <div className="fp-seek-thumb" />
              </div>
            </div>
            <div className="fp-seek-times">
              <span>{fmt(progress * duration)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="fp-controls">
            <button
              className={`fp-icon-btn ${shuffle ? 'active' : ''}`}
              onClick={onToggleShuffle}
              aria-label="Shuffle"
            >
              <ShuffleIcon />
            </button>

            <button className="fp-icon-btn fp-skip" onClick={onPrev} aria-label="Previous">
              <PrevIcon />
            </button>

            <button
              className="fp-play-btn"
              onClick={onPlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isLoading
                ? <span className="btn-spinner" />
                : isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />
              }
            </button>

            <button className="fp-icon-btn fp-skip" onClick={onNext} aria-label="Next">
              <NextIcon />
            </button>

            <button
              className={`fp-icon-btn ${repeat !== 'none' ? 'active' : ''}`}
              onClick={onCycleRepeat}
              aria-label="Repeat"
            >
              {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
            </button>
          </div>

          {/* Volume — hidden on touch devices (iOS controls volume via hardware buttons) */}
          {!isTouchDevice && (
           <div className="fp-volume">
              <VolumeIcon muted={volume === 0} />
                <input
                  type="range"
                      className="fp-volume-slider"
                        min={0} max={1} step={0.01}
                        value={volume}
                        onChange={e => onChangeVolume(parseFloat(e.target.value))}
                />
            <VolumeHighIcon />
          </div>
        )}

        </div>
      )}

      {/* ── Mini bar ── */}
      <div className="mini-player">
        <div
          className="progress-track"
          onClick={handleSeekClick}
          role="slider"
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="player-body" onClick={() => setExpanded(true)}>
          <div className="player-cover">
            {track.coverUrl
              ? <img src={track.coverUrl} alt={track.title} />
              : <span>♪</span>
            }
          </div>

          <div className="player-info">
            <span className="player-title">{track.title}</span>
            <span className="player-artist">{track.artist}</span>
          </div>

          <div className="mini-controls" onClick={e => e.stopPropagation()}>
            <button className="mini-ctrl-btn" onClick={onPrev} aria-label="Previous">
              <PrevIcon size={16} />
            </button>
            <button className="play-btn" onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isLoading
                ? <span className="btn-spinner" />
                : isPlaying ? <PauseIcon /> : <PlayIcon />
              }
            </button>
            <button className="mini-ctrl-btn" onClick={onNext} aria-label="Next">
              <NextIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────

function PlayIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>;
}
function PauseIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
}
function PrevIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="2.5" height="16" rx="1"/></svg>;
}
function NextIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="16.5" y="4" width="2.5" height="16" rx="1"/></svg>;
}
function ShuffleIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>;
}
function RepeatIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
}
function RepeatOneIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="11" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold" textAnchor="middle">1</text></svg>;
}
function ChevronDownIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function VolumeIcon({ muted }: { muted: boolean }) {
  return muted
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>;
}
function VolumeHighIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>;
}