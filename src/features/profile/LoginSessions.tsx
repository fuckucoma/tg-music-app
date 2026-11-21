import { useEffect, useState } from 'react';
import { ApiError, getLoginSessions, revokeLoginSession, type LoginSession } from '../../services/api';
import { useAccount } from '../auth/AuthProvider';

const copy = {
  desktop: {
    title: 'Сессии входа', current: 'Текущая сессия', password: 'Вход по паролю',
    unknownDevice: 'Устройство', revoke: 'Завершить', logout: 'Выйти', retry: 'Повторить',
    loading: 'Загружаем сессии…', empty: 'Активных сессий нет.',
    unavailable: 'Не удалось загрузить сессии.', revokeError: 'Не удалось завершить сессию. Попробуйте ещё раз.',
    locale: 'ru-RU',
  },
  mobile: {
    title: 'Login sessions', current: 'Current session', password: 'Password login',
    unknownDevice: 'Device', revoke: 'Revoke', logout: 'Sign out', retry: 'Retry',
    loading: 'Loading sessions…', empty: 'No active sessions.',
    unavailable: 'Could not load your sessions.', revokeError: 'Could not revoke the session. Try again.',
    locale: 'en-US',
  },
};

type Variant = keyof typeof copy;

export function LoginSessions({ variant }: { variant: Variant }) {
  const { token } = useAccount();
  const [open, setOpen] = useState(false);
  return (
    <details
      className={'shrink-0 rounded-2xl border p-4 text-sm ' + (variant === 'desktop'
        ? 'bg-white/5 border-[var(--line)]' : 'bg-surface border-[var(--border)]')}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">{copy[variant].title}</summary>
      {open && token && <SessionList key={token} variant={variant} token={token} />}
    </details>
  );
}

function deviceLabel(agent: string | null) {
  if (!agent) return null;
  const browser = /Edg(?:e|A|iOS)?\//.test(agent) ? 'Edge'
    : /Firefox\/|FxiOS\//.test(agent) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) ? 'Safari' : null;
  const platform = /iPhone|iPad/.test(agent) ? 'iOS'
    : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows'
    : /Macintosh|Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : null;
  return [browser, platform].filter(Boolean).join(' · ') || null;
}

function SessionList({ variant, token }: { variant: Variant; token: string }) {
  const { checkError, logout } = useAccount();
  const [sessions, setSessions] = useState<LoginSession[] | null>(null);
  const [retries, setRetries] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [revokeError, setRevokeError] = useState(false);
  const labels = copy[variant];

  useEffect(() => {
    const controller = new AbortController();
    getLoginSessions(token, controller.signal)
      .then((list) => { if (!controller.signal.aborted) setSessions(list); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        checkError(error, token);
        setLoadError(true);
      });
    return () => controller.abort();
  }, [token, retries, checkError]);

  async function revoke(session: LoginSession) {
    if (pending) return;
    setPending(session.id);
    setRevokeError(false);
    try {
      if (session.current) await logout();
      else await revokeLoginSession(token, session.id);
    } catch (error) {
      checkError(error, token);
      if (!(error instanceof ApiError && error.status === 404)) {
        setRevokeError(true);
        return;
      }
    } finally {
      setPending(null);
    }
    if (!session.current) setSessions((list) => list?.filter((entry) => entry.id !== session.id) ?? null);
  }

  if (loadError) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p role="alert">{labels.unavailable}</p>
        <button type="button" className="underline" onClick={() => {
          setLoadError(false);
          setRetries((attempt) => attempt + 1);
        }}>{labels.retry}</button>
      </div>
    );
  }
  if (!sessions) return <p className="mt-3" role="status">{labels.loading}</p>;
  if (!sessions.length) return <p className="mt-3" role="status">{labels.empty}</p>;

  return (
    <>
      <ul className="mt-3 grid gap-2">
        {sessions.map((session) => {
          const device = deviceLabel(session.userAgent) ?? labels.unknownDevice;
          const method = session.method === 'telegram' ? 'Telegram' : labels.password;
          const createdAt = new Date(session.createdAt).toLocaleString(labels.locale, { dateStyle: 'short', timeStyle: 'short' });
          return (
            <li key={session.id} className="flex items-center justify-between gap-3 border-t border-current/15 pt-2">
              <div className="min-w-0">
                <p className="font-medium">{device}</p>
                <p className="text-xs opacity-75">{method} · {createdAt}</p>
                {session.current && <p className="text-xs font-medium">{labels.current}</p>}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-current/25 px-2 py-1 disabled:opacity-50"
                aria-label={`${session.current ? labels.logout : labels.revoke} · ${device} · ${createdAt}`}
                disabled={Boolean(pending)}
                onClick={() => { void revoke(session); }}
              >
                {session.current ? labels.logout : labels.revoke}
              </button>
            </li>
          );
        })}
      </ul>
      {revokeError && <p className="mt-2 text-danger" role="alert">{labels.revokeError}</p>}
    </>
  );
}
