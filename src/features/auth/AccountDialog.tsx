import { useState } from 'react';
import { AccountModal } from './AccountModal';
import { CredentialsForm, type AcceptCredentials, type CredentialMode } from './CredentialsForm';
import { ProfileDetails, type ProfileActions } from '../profile/ProfileDetails';
import type { Profile } from '../../services/api';
import { IconButton } from '../../components/Controls';

interface Props extends ProfileActions {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
  onCredentials: AcceptCredentials;
}

export function AccountDialog({ open, profile, onClose, onCredentials, onLogout, onUploadAvatar }: Props) {
  return (
    <AccountModal open={open} onClose={onClose} label="Аккаунт UNDERLAB" className="du-dialog">
      {profile ? (
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Профиль</h2>
            <IconButton icon="close" label="Закрыть" onClick={onClose} />
          </div>
          <ProfileDetails
            profile={profile}
            variant="desktop"
            onUploadAvatar={onUploadAvatar}
            onLogout={() => {
              onClose();
              onLogout();
            }}
          />
        </div>
      ) : <AccountCredentials onClose={onClose} onCredentials={onCredentials} />}
    </AccountModal>
  );
}

function AccountCredentials({ onClose, onCredentials }: Pick<Props, 'onClose' | 'onCredentials'>) {
  const [mode, setMode] = useState<CredentialMode>('login');

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest opacity-60">UNDERLAB MUSIC</p>
          <h2 className="mt-3 text-2xl font-semibold">
            {mode === 'register' ? 'Создать аккаунт' : 'Войти в аккаунт'}
          </h2>
        </div>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <p className="mt-2 text-sm opacity-60">
        Сохраняйте любимые треки и возвращайтесь к ним в любое время.
      </p>
      <CredentialsForm variant="desktop" mode={mode} onModeChange={setMode} onCredentials={onCredentials} />
    </div>
  );
}
