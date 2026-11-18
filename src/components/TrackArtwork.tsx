import { useState, type ReactNode } from 'react';
import type { Track } from '../types/track';

type Props = {
  track?: Track | null;
  className?: string;
  variant?: 'mobile' | 'desktop';
  children?: ReactNode;
  eager?: boolean;
};

export function TrackArtwork({ track, className, variant = 'desktop', children, eager }: Props) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = track?.coverUrl;
  const coverClass = variant === 'desktop'
    ? 'du-cover'
    : 'relative flex flex-shrink-0 items-center justify-center overflow-hidden bg-surface';

  return (
    <span className={className ? `${coverClass} ${className}` : coverClass}
      data-tone={(track?.id ?? 0) % 4} aria-hidden="true">
      {variant === 'desktop' && <span className="du-mini-disc" />}
      {url && url !== failedUrl ? (
        <img
          key={url}
          src={url}
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailedUrl(url)}
          className={variant === 'mobile' ? 'w-full h-full object-cover' : undefined}
          alt=""
        />
      ) : variant === 'mobile' && (
        <span className="text-xl text-muted opacity-50">♪</span>
      )}
      {children}
    </span>
  );
}
