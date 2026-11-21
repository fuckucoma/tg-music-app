import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '../auth/AuthProvider';
import {
  ApiError, confirmTelegramLink, createTelegramLinkCode, previewTelegramLink, unlinkTelegram,
  type Profile, type TelegramLinkPreview,
} from '../../services/api';

type Variant = 'desktop' | 'mobile';

const copy = {
  desktop: {
    connect: 'Привязать Telegram', disconnect: 'Отвязать Telegram', connected: 'Telegram привязан',
    siteConnected: 'Аккаунт сайта привязан', enter: 'Привязать аккаунт сайта', password: 'Пароль от аккаунта сайта',
    create: 'Получить код', code: 'Код с сайта', copy: 'Скопировать', copied: 'Код скопирован',
    select: 'Выделите и скопируйте код вручную.',
    instruction: 'Откройте профиль в Telegram Mini App и введите код в разделе «Привязать аккаунт сайта». Код действует пять минут.',
    enterCode: 'Получите одноразовый код в настройках профиля на сайте.',
    unlinkHelp: 'Вход по логину и паролю и данные аккаунта сайта сохранятся.',
    review: 'Проверить код', confirm: 'Подтвердить привязку', merge: 'Объединить аккаунты', back: 'Назад',
    join: (username: string) => `На сайте выбран аккаунт ${username}.`,
    mergeHelp: 'Избранное, отзывы и обращения из аккаунта Telegram будут перенесены в аккаунт сайта.',
    expired: 'Код истёк. Получите новый код на сайте.',
    reopen: 'Откройте Mini App заново, чтобы подтвердить Telegram.',
    saved: 'Привязка сохранена. Откройте Mini App заново, чтобы обновить вход.',
    disconnected: 'Telegram отвязан. Обновите страницу с профилем.',
    wrongPassword: 'Неверный пароль от аккаунта сайта.', failed: 'Не удалось выполнить действие. Попробуйте ещё раз.',
    protected: 'Этот аккаунт Telegram нельзя объединить.', changed: 'Связь аккаунтов изменилась. Проверьте код ещё раз.',
    waiting: 'Подождите…',
  },
  mobile: {
    connect: 'Link Telegram', disconnect: 'Unlink Telegram', connected: 'Telegram linked',
    siteConnected: 'Website account linked', enter: 'Link your website account', password: 'Website account password',
    create: 'Generate code', code: 'Code from the website', copy: 'Copy', copied: 'Code copied',
    select: 'Select and copy the code manually.',
    instruction: 'Open your profile in the Telegram Mini App and enter this code under “Link your website account”. It expires in five minutes.',
    enterCode: 'Generate a one-time code from your profile on the website.',
    unlinkHelp: 'You can still sign in with your website username and password and keep your account data.',
    review: 'Check code', confirm: 'Confirm link', merge: 'Merge accounts', back: 'Back',
    join: (username: string) => `You are linking to the website account ${username}.`,
    mergeHelp: 'Your Telegram favorites, reviews, and complaints will move to the website account.',
    expired: 'This code expired. Get a new code from the website.',
    reopen: 'Reopen the Mini App to verify Telegram again.',
    saved: 'Your accounts are linked. Reopen the Mini App to finish signing in.',
    disconnected: 'Telegram is unlinked. Reload the profile page to update it.',
    wrongPassword: 'Incorrect website account password.', failed: 'Could not complete the request. Please try again.',
    protected: 'This Telegram account cannot be merged.', changed: 'The account link changed. Check the code again.',
    waiting: 'Please wait…',
  },
};

const mobileInput = 'w-full rounded-xl border border-[var(--border)] bg-bg px-3 py-2 text-text';
const mobileButton = 'rounded-xl bg-accent text-accent-fg px-3 py-2 font-semibold disabled:opacity-40';
const mobileBox = 'bg-surface border-[var(--border)]';
const desktopBox = 'bg-white/5 border-[var(--line)]';

export function TelegramAccount({ profile, variant }: { profile: Profile; variant: Variant }) {
  const { initData, token } = useAccount();
  const labels = copy[variant];
  if (initData && !profile.hasPassword) return <MiniAppLinkForm variant={variant} initData={initData} />;
  if (!initData && token && profile.hasPassword) {
    return <WebsiteLinkForm variant={variant} token={token} linked={Boolean(profile.telegramId)} />;
  }
  if (initData && profile.telegramId) {
    return <p className="text-sm font-medium" role="status">{labels.siteConnected}</p>;
  }
  return null;
}

function WebsiteLinkForm({ variant, token, linked }: { variant: Variant; token: string; linked: boolean }) {
  const { changeAccount, checkError, refreshProfile } = useAccount();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const labels = copy[variant];
  const desktop = variant === 'desktop';

  useEffect(() => {
    if (!code || linked) return;
    const controller = new AbortController();
    const expiresAt = Date.parse(code.expiresAt);
    let timer: number;

    async function checkLink() {
      try {
        if ((await refreshProfile(controller.signal))?.telegramId) return;
      } catch {
        // Retry transient profile errors while the code can still be used.
      }
      if (controller.signal.aborted) return;
      if (Date.now() >= expiresAt) {
        setCode(null);
        setMessage('');
        setError(labels.expired);
      } else {
        timer = window.setTimeout(checkLink, 2500);
      }
    }

    timer = window.setTimeout(checkLink, 2500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [code, linked, refreshProfile, labels.expired]);

  useEffect(() => {
    if (!linked) return;
    setCode(null);
    setMessage('');
    setError('');
  }, [linked]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    let disconnected = false;
    try {
      if (linked) {
        await changeAccount(async () => {
          const replacement = await unlinkTelegram(token, password);
          disconnected = true;
          return replacement;
        });
      } else {
        setCode(await createTelegramLinkCode(token, password));
      }
      setPassword('');
    } catch (cause) {
      checkError(cause, token);
      const wrongPassword = cause instanceof ApiError && cause.status === 400;
      setError(disconnected ? labels.disconnected : wrongPassword ? labels.wrongPassword : labels.failed);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setMessage(labels.copied);
    } catch {
      setMessage(labels.select);
    }
  }

  return (
    <section className={'shrink-0 rounded-2xl border p-4 text-sm ' + (desktop ? desktopBox : mobileBox)}>
      {linked && <p role="status" className="mb-2 font-medium">{labels.connected}</p>}
      <details className="grid gap-2">
        <summary className="cursor-pointer font-semibold">{linked ? labels.disconnect : labels.connect}</summary>
        {code && !linked ? (
          <div className="mt-3 grid gap-2">
            <p className="opacity-80">{labels.instruction}</p>
            <code className="select-all break-all font-mono text-sm">{code.code}</code>
            <button type="button" className={desktop ? 'du-primary' : mobileButton} onClick={copyCode}>
              {labels.copy}
            </button>
          </div>
        ) : (
          <form className="mt-3 grid gap-2" onSubmit={submit}>
            {linked && <p className="opacity-80">{labels.unlinkHelp}</p>}
            <label className="grid gap-1">
              {labels.password}
              <input
                className={desktop ? 'du-input' : mobileInput}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className={desktop ? 'du-primary' : mobileButton} disabled={busy || !password}>
              {busy ? labels.waiting : linked ? labels.disconnect : labels.create}
            </button>
          </form>
        )}
        {message && <p className="mt-2" role="status">{message}</p>}
        {error && <p className="mt-2 text-danger" role="alert">{error}</p>}
      </details>
    </section>
  );
}

function MiniAppLinkForm({ variant, initData }: { variant: Variant; initData: string }) {
  const { changeAccount } = useAccount();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<TelegramLinkPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const labels = copy[variant];
  const desktop = variant === 'desktop';
  const enteredCode = code.trim();
  const validCode = /^[A-Za-z0-9_-]{24}$/.test(enteredCode);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validCode) return;
    setBusy(true);
    setError('');
    let confirmed = false;
    try {
      if (!preview) {
        setPreview(await previewTelegramLink(enteredCode, initData));
        return;
      }
      await changeAccount(async () => {
        const token = await confirmTelegramLink(enteredCode, initData, preview.mergeRequired);
        confirmed = true;
        return token;
      });
    } catch (cause) {
      if (confirmed) {
        setPreview(null);
        setCode('');
        setError(labels.saved);
      } else if (cause instanceof ApiError && cause.status === 401) setError(labels.reopen);
      else if (cause instanceof ApiError && cause.status === 404) setError(labels.expired);
      else if (cause instanceof ApiError && cause.status === 409) setError(preview ? labels.changed : labels.protected);
      else setError(labels.failed);
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={'shrink-0 rounded-2xl border p-4 text-sm ' + (desktop ? desktopBox : mobileBox)}>
      <summary className="cursor-pointer font-semibold">{labels.enter}</summary>
      <form className="mt-3 grid gap-2" onSubmit={submit}>
        {preview ? (
          <>
            <p>{labels.join(preview.username)}</p>
            {preview.mergeRequired && <p className="opacity-80">{labels.mergeHelp}</p>}
          </>
        ) : (
          <>
            <p className="opacity-80">{labels.enterCode}</p>
            <label className="grid gap-1">
              {labels.code}
              <input
                className={desktop ? 'du-input' : mobileInput}
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
          </>
        )}
        {error && <p className="text-danger" role="alert">{error}</p>}
        <button className={desktop ? 'du-primary' : mobileButton} disabled={busy || !validCode}>
          {busy ? labels.waiting : preview ? preview.mergeRequired ? labels.merge : labels.confirm : labels.review}
        </button>
        {preview && (
          <button type="button" disabled={busy} onClick={() => { setPreview(null); setError(''); }}>
            {labels.back}
          </button>
        )}
      </form>
    </details>
  );
}
