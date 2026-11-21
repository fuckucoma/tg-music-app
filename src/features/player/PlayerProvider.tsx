import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { usePlayerController, type PlaybackOptions, type Player } from './usePlayer';

const PlayerContext = createContext<Player | null>(null);

export function PlayerProvider({ children, ...options }: PlaybackOptions & { children: ReactNode }) {
  const player = usePlayerController(options);
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('usePlayer requires a PlayerProvider');
  return player;
}

export function usePlayerProgress() {
  const { progress } = usePlayer();
  return useSyncExternalStore(progress.subscribe, progress.get);
}
