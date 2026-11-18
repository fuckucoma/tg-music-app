import type { Profile } from '../services/api';
import { AccountModal } from '../features/auth/AccountModal';
import { ProfileDetails, type ProfileActions } from '../features/profile/ProfileDetails';

interface Props extends ProfileActions {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
}

export function ProfilePanel({ open, profile, onClose, onLogout, onUploadAvatar }: Props) {
  function logout() {
    onClose();
    onLogout();
  }

  return (
    <AccountModal
      open={open}
      onClose={onClose}
      label="Profile"
      className="fixed inset-x-0 top-auto bottom-0 m-0 h-[85vh] supports-[height:100dvh]:h-[85dvh] max-h-none w-full max-w-none flex-col open:flex bg-bg text-text rounded-t-3xl border-t border-[var(--border)] motion-safe:open:animate-slide-up backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="Close profile"
        className="flex w-full justify-center py-3 shrink-0"
        onClick={onClose}
      >
        <span className="w-10 h-1 rounded-full bg-[var(--border)]" />
      </button>
      {profile ? (
        <ProfileDetails profile={profile} variant="mobile" onLogout={logout} onUploadAvatar={onUploadAvatar} />
      ) : (
        <div className="px-6 pt-4 text-center">
          <h2 className="text-xl font-semibold">Profile unavailable</h2>
          <button type="button" className="mt-6 text-danger" onClick={logout}>Sign out</button>
        </div>
      )}
    </AccountModal>
  );
}
