import type { ButtonHTMLAttributes, ReactNode } from 'react';

const shapes = {
  home: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  library: (
    <>
      <path d="M4 4v16M9 4v16M14 5l5 14" />
    </>
  ),
  heart: <path d="M20 5a5 5 0 0 0-7 0l-1 1-1-1a5 5 0 0 0-7 7l8 8 8-8a5 5 0 0 0 0-7Z" />,
  queue: (
    <>
      <path d="M3 6h17M3 11h12M3 16h8" />
      <path d="m16 14 5 3-5 3z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  note: (
    <>
      <path d="M9 18V6l11-3v13" />
      <ellipse cx="6" cy="18" rx="3" ry="2.6" />
      <ellipse cx="17" cy="16" rx="3" ry="2.6" />
    </>
  ),
  play: (
    <path
      fill="currentColor"
      stroke="none"
      d="M7 4.8a.8.8 0 0 1 1.2-.7l11.2 7.2a.8.8 0 0 1 0 1.4L8.2 20a.8.8 0 0 1-1.2-.7z"
    />
  ),
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </g>
  ),
  prev: (
    <>
      <path d="M5 5v14" />
      <path fill="currentColor" d="m18 5-10 7 10 7z" />
    </>
  ),
  next: (
    <>
      <path d="M19 5v14" />
      <path fill="currentColor" d="m6 5 10 7-10 7z" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3 6h3c4 0 7 12 11 12h4m-3-3 3 3-3 3M3 18h3c2 0 3-2 5-5m3-5 3-2h4m-3-3 3 3-3 3" />
    </>
  ),
  repeat: (
    <>
      <path d="m16 2 4 4-4 4M4 11V9a3 3 0 0 1 3-3h13M8 22l-4-4 4-4m12-1v2a3 3 0 0 1-3 3H4" />
    </>
  ),
  volume: (
    <>
      <path d="M3 10h4l5-4v12l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  mute: (
    <>
      <path d="M3 10h4l5-4v12l-5-4H3zM16 9l6 6m0-6-6 6" />
    </>
  ),
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="12" width="4" height="8" rx="2" />
      <rect x="17" y="12" width="4" height="8" rx="2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof shapes;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name]}
    </svg>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  size?: number;
};
export function IconButton({ icon, label, size, className = '', ...props }: IconButtonProps) {
  return (
    <button type="button" className={'du-icon ' + className} aria-label={label} title={label} {...props}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function time(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
