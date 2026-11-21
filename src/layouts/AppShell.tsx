import { useEffect, useState } from 'react';
import { LoginScreen } from '../components/LoginScreen';
import { useAccount } from '../features/auth/AuthProvider';
import { useFavorites } from '../features/favorites/useFavorites';
import type { useLibrary } from '../features/library/useLibrary';
import { useCatalogSearch } from '../features/search/useCatalogSearch';
import DesktopLayout from './DesktopLayout';
import MobileLayout from './MobileLayout';

export interface LayoutProps {
  auth: ReturnType<typeof useAccount>;
  favorites: ReturnType<typeof useFavorites>;
  library: ReturnType<typeof useLibrary>;
  search: ReturnType<typeof useCatalogSearch>;
  hapticTap: () => void;
}

const desktop = window.matchMedia('(min-width: 651px)');

export function AppShell({ library }: { library: LayoutProps['library'] }) {
  const [wide, setWide] = useState(desktop.matches);
  const auth = useAccount();
  const { initData, hapticTap } = auth;
  const favorites = useFavorites(auth.token, auth.openAuth, auth.checkError);
  const search = useCatalogSearch(library.tracks, library.revision);

  useEffect(() => {
    const resize = () => setWide(desktop.matches);
    desktop.addEventListener('change', resize);
    resize();
    return () => desktop.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    document.documentElement.lang = wide ? 'ru' : 'en';
    document.title = wide ? 'UNDERLAB — Музыка' : 'UNDERLAB — Music';
  }, [wide]);

  if (initData && auth.status === 'checking') {
    return <p className="grid h-full place-content-center text-muted" role="status">Загрузка…</p>;
  }
  if (initData && auth.status !== 'authenticated') {
    return (
      <div className="relative h-full">
        <LoginScreen onCredentials={auth.acceptCredentials} />
        {auth.status === 'unavailable' && (
          <button className="absolute inset-x-0 bottom-4 mx-auto w-fit px-4 py-2 text-muted" onClick={auth.retry}>
            Повторить вход через Telegram
          </button>
        )}
      </div>
    );
  }

  const Layout = wide ? DesktopLayout : MobileLayout;
  return <Layout auth={auth} library={library} favorites={favorites} search={search} hapticTap={hapticTap} />;
}
