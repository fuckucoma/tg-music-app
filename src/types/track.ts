export interface Track {
  id: number ;
  title: string;
  artist: string;
  duration?: number;        // seconds
  coverUrl?: string;        // URL to cover image
  streamUrl: string;        // full streaming URL
  album?: string;
  genre?: string;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
