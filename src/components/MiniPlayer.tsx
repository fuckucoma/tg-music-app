import { useState } from 'react';
import type { Track } from '../types/track';
import type { PlayerStatus } from '../types/track';
import type { RepeatMode } from '../hooks/usePlayer';

interface Props {
  track: Track; status: PlayerStatus; progress: number; duration: number; volume: number;
  shuffle: boolean; repeat: RepeatMode;
  onPlayPause: () => void; onSeek: (r: number) => void;
  onNext: () => void; onPrev: () => void;
  onChangeVolume: (v: number) => void;
  onToggleShuffle: () => void; onCycleRepeat: () => void;
}

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export function MiniPlayer({ track, status, progress, duration, volume, shuffle, repeat,
  onPlayPause, onSeek, onNext, onPrev, onChangeVolume, onToggleShuffle, onCycleRepeat }: Props) {

  const [expanded, setExpanded] = useState(false);
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';
  const isTouch   = typeof window !== 'undefined' && window.matchMedia('(hover:none) and (pointer:coarse)').matches;

  const seekFrom = (clientX: number, rect: DOMRect) =>
    onSeek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));

  const onClickSeek  = (e: React.MouseEvent<HTMLDivElement>)  => seekFrom(e.clientX, e.currentTarget.getBoundingClientRect());
  const onTouchSeek  = (e: React.TouchEvent<HTMLDivElement>)  => {
    e.preventDefault();
    const t = e.touches[0] ?? e.changedTouches[0];
    seekFrom(t.clientX, e.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      {/* ── Full player ── */}
      {expanded && (
        <div className="fixed inset-0 z-[300] flex flex-col bg-bg overflow-hidden">

          {/* Background blur */}
          {track.coverUrl && (
            <div
              className="absolute inset-[-20px] bg-cover bg-center opacity-20 blur-3xl saturate-150 pointer-events-none"
              style={{ backgroundImage: `url(${track.coverUrl})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-bg pointer-events-none" />

          {/* Content */}
          <div className="relative flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-2 flex-shrink-0">
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-text active:opacity-50" onClick={() => setExpanded(false)}>
                <ChevronDown />
              </button>
              <span className="text-[11px] font-semibold tracking-widest uppercase text-muted">Now Playing</span>
              <div className="w-10" />
            </div>

            {/* Cover */}
            <div className="flex justify-center px-8 py-4 flex-shrink-0">
              <div className={`w-[min(280px,65vw)] h-[min(280px,65vw)] rounded-2xl overflow-hidden bg-surface shadow-2xl transition-transform duration-500 ${isPlaying ? 'scale-105' : 'scale-100'}`}>
                {track.coverUrl
                  ? <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-6xl text-muted opacity-30">♪</div>
                }
              </div>
            </div>

            {/* Info */}
            <div className="px-7 flex-shrink-0">
              <p className="text-[22px] font-semibold text-text tracking-tight truncate">{track.title}</p>
              <p className="text-[15px] text-muted font-mono truncate mt-0.5">{track.artist}</p>
            </div>

            {/* Seek */}
            <div className="px-7 mt-5 flex-shrink-0">
              <div
                className="h-1 rounded-full bg-[var(--border)] cursor-pointer relative touch-none"
                onClick={onClickSeek} onTouchStart={onTouchSeek} onTouchMove={onTouchSeek}
              >
                <div className="h-full rounded-full bg-accent transition-[width] duration-200 relative" style={{ width: `${progress * 100}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow-md" />
                </div>
              </div>
              <div className="flex justify-between mt-2 text-[11px] text-muted font-mono">
                <span>{fmt(progress * duration)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between px-6 mt-4 flex-shrink-0">
              <button className={`w-10 h-10 flex items-center justify-center rounded-xl transition-opacity ${shuffle ? 'text-accent' : 'text-muted'} active:opacity-50`} onClick={onToggleShuffle}>
                <ShuffleIcon />
              </button>
              <button className="w-10 h-10 flex items-center justify-center text-text rounded-xl active:opacity-50" onClick={onPrev}>
                <PrevIcon size={24} />
              </button>
              <button className="w-16 h-16 rounded-full bg-accent text-accent-fg flex items-center justify-center shadow-lg active:scale-95 transition-transform" onClick={onPlayPause}>
                {isLoading
                  ? <span className="w-6 h-6 border-2 border-accent-fg/30 border-t-accent-fg rounded-full animate-spin-slow" />
                  : isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />
                }
              </button>
              <button className="w-10 h-10 flex items-center justify-center text-text rounded-xl active:opacity-50" onClick={onNext}>
                <NextIcon size={24} />
              </button>
              <button className={`w-10 h-10 flex items-center justify-center rounded-xl transition-opacity ${repeat !== 'none' ? 'text-accent' : 'text-muted'} active:opacity-50`} onClick={onCycleRepeat}>
                {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
              </button>
            </div>

            {/* Volume — desktop only */}
            {!isTouch && (
              <div className="flex items-center gap-3 px-7 mt-5 flex-shrink-0 text-muted">
                <VolumeIcon muted={volume === 0} />
                <input type="range" className="flex-1" min={0} max={1} step={0.01} value={volume} onChange={e => onChangeVolume(parseFloat(e.target.value))} />
                <VolumeHighIcon />
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Mini bar ── */}
      <div className="fixed left-0 right-0 z-[102] bg-surface/95 backdrop-blur-xl border-t border-[var(--border)]"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        {/* Progress line */}
        <div className="h-[2px] bg-[var(--border)] cursor-pointer" onClick={onClickSeek}>
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>

        {/* Body */}
        <div className="flex items-center gap-3 px-4 h-[60px] cursor-pointer" onClick={() => setExpanded(true)}>
          {/* Cover */}
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-bg flex items-center justify-center text-lg text-muted">
            {track.coverUrl ? <img src={track.coverUrl} alt="" className="w-full h-full object-cover" /> : '♪'}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-text truncate">{track.title}</p>
            <p className="text-[12px] text-muted font-mono truncate">{track.artist}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button className="w-9 h-9 flex items-center justify-center text-muted rounded-xl active:opacity-50" onClick={onPrev}>
              <PrevIcon size={17} />
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-accent-fg active:scale-95 transition-transform" onClick={onPlayPause}>
              {isLoading
                ? <span className="w-4 h-4 border-2 border-accent-fg/30 border-t-accent-fg rounded-full animate-spin-slow" />
                : isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} />
              }
            </button>
            <button className="w-9 h-9 flex items-center justify-center text-muted rounded-xl active:opacity-50" onClick={onNext}>
              <NextIcon size={17} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────
const PlayIcon   = ({ size = 22 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>;
const PauseIcon  = ({ size = 22 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
const PrevIcon   = ({ size = 22 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="2.5" height="16" rx="1"/></svg>;
const NextIcon   = ({ size = 22 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="16.5" y="4" width="2.5" height="16" rx="1"/></svg>;
const ChevronDown = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>;
const ShuffleIcon = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>;
const RepeatIcon  = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
const RepeatOneIcon = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="11" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold" textAnchor="middle">1</text></svg>;
const VolumeIcon  = ({ muted }: { muted: boolean }) => muted
  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>;
const VolumeHighIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>;