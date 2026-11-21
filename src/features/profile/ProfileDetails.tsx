import { useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '../../components/Controls';
import type { Profile } from '../../services/api';
import { LoginSessions } from './LoginSessions';
import { TelegramAccount } from './TelegramAccount';

export interface ProfileActions {
  onLogout: () => void;
  onUploadAvatar: (file: File) => Promise<void>;
}

interface Props extends ProfileActions {
  profile: Profile;
  variant: 'desktop' | 'mobile';
}

const copy = {
  desktop: {
    user: 'Пользователь', editAvatar: 'Изменить аватар', uploading: 'Загрузка аватара',
    uploadError: 'Не удалось загрузить аватар. Попробуйте ещё раз.', memberSince: 'В сервисе с',
    account: 'Аккаунт', admin: 'Администратор', standard: 'Стандартный', userId: 'ID пользователя',
    telegramId: 'ID Telegram', logout: 'Выйти', locale: 'ru-RU',
  },
  mobile: {
    user: 'User', editAvatar: 'Change avatar', uploading: 'Uploading avatar',
    uploadError: 'Could not upload your avatar. Please try again.', memberSince: 'Member since',
    account: 'Account', admin: 'Admin', standard: 'Standard', userId: 'User ID',
    telegramId: 'Telegram ID', logout: 'Sign out', locale: 'en-US',
  },
};

export function ProfileDetails({ profile, variant, onLogout, onUploadAvatar }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const desktop = variant === 'desktop';
  const labels = copy[variant];
  const name = profile.displayName || profile.telegramName || profile.username || labels.user;
  const joined = profile.createdAt && new Date(profile.createdAt).toLocaleDateString(labels.locale, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setError(false);
    try {
      await onUploadAvatar(file);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={desktop ? 'mt-5 flex flex-col gap-4' : 'flex-1 overflow-y-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-4 pt-4'}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className={'w-24 h-24 rounded-full flex items-center justify-center text-3xl font-semibold overflow-hidden shadow-xl ' + (
            desktop ? 'bg-[var(--mint)] text-[#18201a]' : 'bg-accent text-accent-fg'
          )}>
            {profile.profileImageUrl
              ? <img src={profile.profileImageUrl} alt="" className="w-full h-full object-cover" />
              : <span>{name.slice(0, 2).toUpperCase()}</span>}
            {uploading && (
              <div role="status" aria-label={labels.uploading} className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            type="button"
            className={'absolute bottom-0 right-0 w-8 h-8 rounded-full border-2 flex items-center justify-center active:opacity-60 shadow-md ' + (
              desktop ? 'bg-[#2b2d36] border-[#191b24]' : 'bg-surface border-bg text-text'
            )}
            aria-label={labels.editAvatar}
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            <EditIcon />
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={upload} />
        </div>

        {error && <p role="alert" className="text-danger text-sm text-center">{labels.uploadError}</p>}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-2xl font-semibold">{name}</h2>
            {profile.telegramId && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#229ED9]/20 text-[#229ED9]">TG</span>
            )}
          </div>
          {profile.username && profile.telegramName && profile.username !== name && (
            <p className="text-[12px] mt-0.5 font-mono opacity-70">@{profile.username}</p>
          )}
          {joined && (
            <p className="text-[13px] font-mono mt-0.5 opacity-70">{labels.memberSince} {joined}</p>
          )}
        </div>
      </div>

      <dl className={'shrink-0 rounded-2xl border overflow-hidden divide-y ' + (
        desktop ? 'bg-white/5 border-[var(--line)] divide-[var(--line)]'
          : 'bg-surface border-[var(--border)] divide-[var(--border)]'
      )}>
        <div className="flex justify-between items-center mx-4 py-3.5">
          <dt className="text-[14px] opacity-70">{labels.account}</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            {profile.telegramId && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#229ED9]/15 text-[#229ED9] font-semibold">Telegram</span>
            )}
            {profile.isAdmin ? labels.admin : labels.standard}
          </dd>
        </div>
        <div className="flex justify-between items-center mx-4 py-3.5">
          <dt className="text-[14px] opacity-70">{labels.userId}</dt>
          <dd className="text-[14px] font-mono">#{profile.id}</dd>
        </div>
        {profile.telegramId && (
          <div className="flex justify-between items-center mx-4 py-3.5">
            <dt className="text-[14px] opacity-70">{labels.telegramId}</dt>
            <dd className="text-[14px] font-mono">{profile.telegramId}</dd>
          </div>
        )}
      </dl>

      <TelegramAccount key={profile.id} profile={profile} variant={variant} />
      <LoginSessions variant={variant} />

      <button
        type="button"
        className={'w-full h-12 shrink-0 rounded-2xl border border-danger/25 text-danger font-medium text-[15px] flex items-center justify-center gap-2.5 hover:bg-danger/10 active:bg-danger/10 transition-colors ' + (
          desktop ? 'mt-2' : 'mt-10'
        )}
        onClick={onLogout}
      >
        <Icon name="logout" size={17} />
        {labels.logout}
      </button>
    </div>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
