import type { Track } from '../../types/track';

export type RepeatMode = 'none' | 'all' | 'one';

export interface PlaybackQueue {
  tracks: Track[];
  index: number;
  order: number[] | null;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const emptyQueue: PlaybackQueue = {
  tracks: [],
  index: -1,
  order: null,
  shuffle: false,
  repeat: 'none',
};

function shuffledOrder(length: number, first: number) {
  const remaining = Array.from({ length }, (_, index) => index).filter(index => index !== first);
  for (let end = remaining.length - 1; end > 0; end--) {
    const swap = Math.floor(Math.random() * (end + 1));
    [remaining[end], remaining[swap]] = [remaining[swap], remaining[end]];
  }
  return [first, ...remaining];
}

export function selectTrack(queue: PlaybackQueue, track: Track, trackList = queue.tracks): PlaybackQueue {
  const index = trackList.findIndex(item => item.id === track.id);
  const tracks = index === -1 ? [...trackList, track] : trackList;
  const selected = index === -1 ? tracks.length - 1 : index;
  return {
    ...queue,
    tracks,
    index: selected,
    order: queue.shuffle ? shuffledOrder(tracks.length, selected) : null,
  };
}

export function nextTrack(queue: PlaybackQueue, fromEnded: boolean): PlaybackQueue | null {
  if (!queue.tracks.length) return null;
  const position = queue.order ? queue.order.indexOf(queue.index) : queue.index;
  if (position + 1 < queue.tracks.length) {
    return { ...queue, index: queue.order?.[position + 1] ?? position + 1 };
  }
  if (fromEnded && queue.repeat !== 'all') return null;
  const index = queue.order?.[0] ?? 0;
  return {
    ...queue,
    index,
    order: queue.shuffle ? shuffledOrder(queue.tracks.length, index) : null,
  };
}

export function previousTrack(queue: PlaybackQueue): PlaybackQueue | null {
  if (!queue.tracks.length) return null;
  const position = queue.order ? queue.order.indexOf(queue.index) : queue.index;
  const previous = Math.max(0, position - 1);
  return { ...queue, index: queue.order?.[previous] ?? previous };
}

export function toggleShuffle(queue: PlaybackQueue): PlaybackQueue {
  const shuffle = !queue.shuffle;
  return {
    ...queue,
    shuffle,
    order: shuffle && queue.index >= 0 ? shuffledOrder(queue.tracks.length, queue.index) : null,
  };
}

const nextRepeat: Record<RepeatMode, RepeatMode> = { none: 'all', all: 'one', one: 'none' };

export function cycleRepeat(queue: PlaybackQueue): PlaybackQueue {
  return { ...queue, repeat: nextRepeat[queue.repeat] };
}
