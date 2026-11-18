import { useEffect, useRef, useState } from 'react';
import { BASE_URL, login, setToken } from '../api/tracks';

type Props = { open: boolean; onClose: () => void; onSuccess: () => void };
export function AccountDialog({ open, onClose, onSuccess }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (register) {
        const response = await fetch(`${BASE_URL}/users/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error === 'Username already taken'
              ? 'Это имя пользователя уже занято.'
              : 'Не удалось создать аккаунт.',
          );
        if (!data.token) throw new Error('Сервер не вернул данные для входа.');
        setToken(data.token);
      } else await login(username.trim(), password);
      setPassword('');
      onSuccess();
    } catch (e) {
      setError(
        register
          ? (e as Error).message || 'Не удалось создать аккаунт.'
          : 'Не удалось войти. Проверьте логин и пароль.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="du-dialog"
      aria-labelledby="du-account-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-60">UNDERLAB MUSIC</p>
            <h2 id="du-account-title" className="mt-3 text-2xl font-semibold">
              {register ? 'Создать аккаунт' : 'Войти в аккаунт'}
            </h2>
          </div>
          <button type="button" className="du-icon" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm opacity-60">
          Сохраняйте любимые треки и возвращайтесь к ним в любое время.
        </p>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            Логин
            <input
              className="du-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="grid gap-2 text-sm">
            Пароль
            <input
              className="du-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-pink-300">
              {error}
            </p>
          )}
          <button className="du-primary" disabled={busy}>
            {busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}
          </button>
          <button
            type="button"
            className="text-sm opacity-70 hover:opacity-100"
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
          </button>
        </form>
      </div>
    </dialog>
  );
}
