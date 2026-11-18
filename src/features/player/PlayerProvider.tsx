import { createContext, useContext, type ReactNode } from 'react';
import { usePlayerController, type Player } from './usePlayer';

const PlayerContext = createContext<Player | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = usePlayerController();
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('usePlayer requires a PlayerProvider');
  return player;
}
