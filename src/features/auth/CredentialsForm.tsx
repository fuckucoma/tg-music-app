import { useEffect, useRef, useState, type FormEvent } from 'react';
import { login, register } from '../../services/api';

export type AcceptCredentials = (token: string, signal?: AbortSignal) => Promise<void>;
export type CredentialMode = 'login' | 'register';

const mobileInput = 'w-full h-12 rounded-2xl bg-surface border border-[var(--border)] px-4 text-text placeholder:text-muted text-[15px] outline-none focus:border-accent transition-colors';
const mobileSubmit = 'w-full h-12 rounded-2xl bg-accent text-accent-fg font-semibold text-[15px] hover:opacity-80 transition-opacity disabled:opacity-40 active:opacity-75';

interface Props {
  variant: 'desktop' | 'mobile';
  mode: CredentialMode;
  onModeChange: (mode: CredentialMode) => void;
  onCredentials: AcceptCredentials;
}

export function CredentialsForm({ variant, mode, onModeChange, onCredentials }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const desktop = variant === 'desktop';
  const signingUp = mode === 'register';
  const showConfirmation = signingUp && !desktop;
  const usernameLabel = desktop ? 'Логин' : 'Username';
  const passwordLabel = desktop ? 'Пароль' : 'Password';
  const submitLabel = desktop
    ? signingUp ? 'Создать аккаунт' : 'Войти'
    : signingUp ? 'Create account' : 'Sign in';

  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || !username.trim() || !password) return;
    if (showConfirmation && password !== confirmation) {
      setError('Passwords do not match');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const authenticate = signingUp ? register : login;
      const token = await authenticate(username.trim(), password, controller.signal);
      if (!controller.signal.aborted) await onCredentials(token, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : '';
      if (!desktop) setError(message || (signingUp ? 'Registration failed' : 'Login failed'));
      else if (message === 'Username already taken') setError('Это имя пользователя уже занято.');
      else setError(signingUp ? 'Не удалось создать аккаунт.' : 'Не удалось войти. Проверьте логин и пароль.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function switchMode() {
    setPassword('');
    setConfirmation('');
    setError('');
    onModeChange(signingUp ? 'login' : 'register');
  }

  return (
    <form onSubmit={submit} className={desktop ? 'mt-6 grid gap-4' : 'flex flex-col gap-5'}>
      <div className={desktop ? 'grid gap-4' : 'flex flex-col gap-3'}>
        <label className={desktop ? 'grid gap-2 text-sm' : undefined}>
          <span className={desktop ? undefined : 'sr-only'}>{usernameLabel}</span>
          <input
            className={desktop ? 'du-input' : mobileInput}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={desktop ? undefined : usernameLabel}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label className={desktop ? 'grid gap-2 text-sm' : undefined}>
          <span className={desktop ? undefined : 'sr-only'}>{passwordLabel}</span>
          <input
            className={desktop ? 'du-input' : mobileInput}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={desktop ? undefined : passwordLabel}
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            minLength={signingUp ? 8 : undefined}
            required
          />
        </label>
        {showConfirmation && (
          <input
            className={mobileInput}
            type="password"
            aria-label="Confirm password"
            placeholder="Confirm password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            required
          />
        )}
      </div>
      {error && (
        <p role="alert" className={desktop ? 'text-sm text-pink-300' : 'text-danger text-sm text-center -mt-2'}>
          {error}
        </p>
      )}
      <button
        type="submit"
        className={desktop ? 'du-primary' : mobileSubmit}
        disabled={busy || !username.trim() || !password || (showConfirmation && !confirmation)}
      >
        {!busy ? submitLabel : desktop ? 'Подождите…' : (
          <span
            aria-label="Please wait"
            role="status"
            className="inline-block w-5 h-5 border-2 border-accent-fg/30 border-t-accent-fg rounded-full animate-spin-slow"
          />
        )}
      </button>
      <button
        type="button"
        className={desktop ? 'text-sm opacity-70 hover:opacity-100' : 'text-sm text-muted text-center hover:opacity-80 transition-opacity'}
        onClick={switchMode}
        disabled={busy}
      >
        {desktop
          ? signingUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'
          : <>{signingUp ? 'Already have an account?' : 'No account?'}{' '}
            <span className="text-accent font-semibold">{signingUp ? 'Sign in' : 'Create one'}</span></>}
      </button>
    </form>
  );
}
