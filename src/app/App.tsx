import { AuthProvider, useAccount } from '../features/auth/AuthProvider';
import { useLibrary } from '../features/library/useLibrary';
import { PlayerProvider } from '../features/player/PlayerProvider';
import { AppShell } from '../layouts/AppShell';

function PlaybackRoot() {
  const account = useAccount();
  const library = useLibrary();
  const platform = /Android/.test(navigator.userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : 'Desktop';
  return (
    <PlayerProvider
      userId={account.profile?.id ?? null}
      token={account.token}
      deviceLabel={`${account.initData ? 'Telegram' : 'Web'} · ${platform}`}
      platform={account.initData ? 'telegram' : 'browser'}
      catalog={library.tracks}
      onSessionExpired={account.checkError}
    >
      <AppShell library={library} />
    </PlayerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlaybackRoot />
    </AuthProvider>
  );
}
