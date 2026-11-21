import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../features/player/PlayerProvider';
import type { Track } from '../types/track';
import { AccountDialog } from '../features/auth/AccountDialog';
import { Icon, IconButton, type IconName } from '../components/Controls';
import { TrackArtwork } from '../components/TrackArtwork';
import { SearchBar } from '../components/SearchBar';
import { TrackRow } from '../components/TrackRow';
import { TrackPageControls } from '../components/TrackPageControls';
import FeaturedRelease from '../components/FeaturedRelease';
import { PlaybackBar } from '../desktop/PlaybackBar';
import type { LayoutProps } from './AppShell';
import '../desktop/desktop.css';

const pages = {
  home: 'Обзор',
  catalog: 'Каталог',
  favorites: 'Избранное',
  queue: 'Очередь',
};
type Page = keyof typeof pages;
const icons: Record<Page, IconName> = {
  home: 'home',
  catalog: 'library',
  favorites: 'heart',
  queue: 'queue',
};
const plural = new Intl.PluralRules('ru');
function countTracks(count: number) {
  const forms: Record<string, string> = { one: 'трек', few: 'трека', many: 'треков' };
  return count + ' ' + (forms[plural.select(count)] ?? 'треков');
}

function recentReleases(tracks: Track[]) {
  const artists = new Set<string>();
  const releases: Track[] = [];
  for (const track of tracks) {
    const artist = track.artist.trim().toLocaleLowerCase();
    if (artists.has(artist)) continue;
    releases.push(track);
    artists.add(artist);
    if (releases.length === 4) break;
  }
  return releases;
}

function BrandMark() {
  return (
    <span className="du-brandmark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export default function DesktopLayout({ auth, favorites, library, search: catalogSearch, hapticTap }: LayoutProps) {
  const player = usePlayer();
  const [page, setPage] = useState<Page>('home');
  const { query, setQuery } = catalogSearch;
  const authed = auth.status === 'authenticated';
  const userName = auth.profile?.displayName || auth.profile?.telegramName || auth.profile?.username || '';
  const notice = auth.notice || favorites.notice;
  const [focusIndex, setFocusIndex] = useState(0);
  const [sort, setSort] = useState('newest');
  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLElement>(null);

  const newest = useMemo(() => [...library.tracks].sort((a, b) => b.id - a.id), [library.tracks]);
  const fresh = useMemo(() => recentReleases(newest), [newest]);
  const spotlight = newest.length ? newest[focusIndex % newest.length] : null;
  const isPlaying = player.status === 'playing';
  const term = query.trim();
  const overview = page === 'home' && !term;
  const inFavorites = page === 'favorites' && !term;
  const inQueue = page === 'queue' && !term;
  const current = player.currentTrack;
  const tracks = useMemo(() => {
    if (inQueue) return player.queue;
    const list = inFavorites ? favorites.favorites : term ? catalogSearch.tracks : newest;
    if (!overview && sort === 'title')
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (!overview && sort === 'artist')
      return [...list].sort((a, b) => a.artist.localeCompare(b.artist, 'ru'));
    if (term) return [...list].sort((a, b) => b.id - a.id);
    return list;
  }, [newest, favorites.favorites, catalogSearch.tracks, player.queue, term, inQueue, inFavorites, sort, overview]);
  const [historyIds, setHistoryIds] = useState<number[]>([]);
  useEffect(() => {
    if (current && isPlaying)
      setHistoryIds((old) => [current.id, ...old.filter((id) => id !== current.id)].slice(0, 3));
  }, [current, isPlaying]);
  const history = historyIds
    .map((id) => newest.find((track) => track.id === id))
    .filter((track): track is Track => !!track);
  const go = (next: Page) => {
    setQuery('');
    setPage(next);
    scroller.current?.scrollTo({ top: 0 });
  };
  const start = () => {
    if (current) player.play(current);
    else if (tracks[0]) player.play(tracks[0], tracks);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (auth.authOpen || event.isComposing) return;
      const el = event.target as HTMLElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        search.current?.focus();
        search.current?.select();
      } else if (
        event.code === 'Space' &&
        !event.repeat &&
        !el.closest('input,textarea,select,button,a,[contenteditable="true"]')
      ) {
        event.preventDefault();
        if (current) player.play(current);
        else if (tracks[0]) player.play(tracks[0], tracks);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [auth.authOpen, current, player.play, tracks]);

  function navItem(key: Page) {
    return (
      <button
        key={key}
        className="du-navitem"
        onClick={() => go(key)}
        aria-label={pages[key]}
        title={pages[key]}
        aria-current={!term && page === key ? 'page' : undefined}
      >
        <Icon name={icons[key]} />
        <span>{pages[key]}</span>
        {key === 'favorites' && authed && <small>{favorites.favorites.length}</small>}
      </button>
    );
  }
  const loading = inQueue ? false : inFavorites ? favorites.favoritesLoading : term ? catalogSearch.loading : library.loading;
  const error = inQueue ? '' : inFavorites ? favorites.favoritesError : term ? catalogSearch.error : library.error;
  const retry = inFavorites ? favorites.reloadFavorites : term ? catalogSearch.retry : library.reload;
  const trackPage = term ? catalogSearch : library;
  const showPages = !overview && !inFavorites && !inQueue && !error && !loading;
  const title = term ? 'Результаты поиска' : pages[page];
  const showLogin = inFavorites && !authed;
  const rows =
    overview && tracks.length > fresh.length
      ? tracks.filter((track) => !fresh.some((release) => release.id === track.id)).slice(0, 8)
      : tracks;
  return (
    <div className="du-shell">
      <aside className="du-rail">
        <button className="du-brand" aria-label="UNDERLAB — обзор" onClick={() => go('home')}>
          <BrandMark />
          <span>
            underlab<span className="du-brand-dot">.</span>
          </span>
        </button>
        <nav aria-label="Навигация" className="grid gap-1">
          <p className="du-label">Музыка</p>
          {navItem('home')}
          {navItem('catalog')}
          <p className="du-label du-second-label">Медиатека</p>
          {navItem('favorites')}
          {navItem('queue')}
        </nav>
        {history.length > 0 && (
          <section className="du-history">
            <h2 className="du-label">Недавно слушали</h2>
            {history.map((track) => (
              <button key={track.id} title={track.title} onClick={() => player.play(track, newest)}>
                <TrackArtwork track={track} />
                <span className="min-w-0">
                  <strong className="block truncate">{track.title}</strong>
                  <small className="block truncate">{track.artist}</small>
                </span>
              </button>
            ))}
          </section>
        )}
        <div className="du-shortcuts">
          <div>
            <span>Поиск</span>
            <kbd>Ctrl K</kbd>
          </div>
          <div>
            <span>Пуск / пауза</span>
            <kbd>Пробел</kbd>
          </div>
        </div>
      </aside>
      <div className="du-workspace">
        <header className="du-top">
          <SearchBar
            variant="desktop"
            value={query}
            loading={catalogSearch.loading}
            inputRef={search}
            onChange={(value) => {
              setQuery(value);
              scroller.current?.scrollTo({ top: 0 });
            }}
          />
          {authed ? (
            <div className="du-account">
              <button className="flex min-w-0 items-center gap-2" type="button" onClick={auth.openAuth} aria-label="Открыть профиль">
                <span className="du-avatar overflow-hidden">
                  {auth.profile?.profileImageUrl
                    ? <img src={auth.profile.profileImageUrl} alt="" className="h-full w-full object-cover" />
                    : (userName || 'Я').slice(0, 1)}
                </span>
                <strong className="truncate">{userName || 'Аккаунт'}</strong>
              </button>
              <IconButton icon="logout" size={17} label="Выйти" onClick={auth.logout} />
            </div>
          ) : (
            <button type="button" className="du-login" onClick={auth.openAuth} disabled={auth.status === 'checking'}>
              <Icon name="user" size={16} />
              Войти
            </button>
          )}
        </header>
        <main ref={scroller} className="du-scroll">
          <div className="du-page">
            <div className="du-heading">
              <h1>{title}</h1>
              {!overview && !loading && !error && !showLogin && (
                <span className="du-count">
                  {showPages && trackPage.hasMore ? 'Показано ' : ''}{countTracks(tracks.length)}
                </span>
              )}
            </div>
            {overview && !library.error && (
              <>
                <FeaturedRelease
                  track={spotlight}
                  playing={isPlaying && !!spotlight && current?.id === spotlight.id}
                  onPlay={() => spotlight && player.play(spotlight, newest)}
                  onNext={() => setFocusIndex((i) => i + 1)}
                  canNext={newest.length > 1}
                  loading={library.loading}
                />
                {fresh.length > 0 && (
                  <section className="du-new" aria-labelledby="du-releases-title">
                    <div className="du-sectionhead">
                      <h2 id="du-releases-title">Недавние релизы</h2>
                      <button className="du-link" onClick={() => go('catalog')}>
                        В каталог <Icon name="arrow" size={15} />
                      </button>
                    </div>
                    <div className="du-cards">
                      {fresh.map((track, index) => (
                        <button
                          key={track.id}
                          className="du-card"
                          onClick={() => player.play(track, newest)}
                          title={track.artist + ' — ' + track.title}
                        >
                          <span className="du-card-art" data-palette={index}>
                            <span aria-hidden="true" className="du-card-disc" />
                            <span className="du-card-play">
                              <Icon
                                name={current?.id === track.id && isPlaying ? 'pause' : 'play'}
                                size={16}
                              />
                            </span>
                          </span>
                          <strong className="block truncate">{track.title}</strong>
                          <small className="block truncate">{track.artist}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
            {overview && (
              <div className="du-sectionhead">
                <h2>Из каталога</h2>
              </div>
            )}
            {!overview && !inQueue && tracks.length > 1 && (
              <label className="du-sort">
                {showPages && trackPage.hasMore ? 'Сортировка загруженных треков' : 'Сортировка'}
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="newest">{inFavorites ? 'По умолчанию' : 'Сначала новые'}</option>
                  <option value="title">По названию</option>
                  <option value="artist">По исполнителю</option>
                </select>
              </label>
            )}
            {showLogin ? (
              <StateMessage
                icon="heart"
                title="Ваши любимые треки"
                text="Войдите, чтобы открыть коллекцию и сохранять музыку."
                action="Войти"
                onAction={auth.openAuth}
              />
            ) : loading ? (
              <div className="du-state" role="status">
                Загружаем треки…
              </div>
            ) : error ? (
              <StateMessage
                icon="library"
                title={error}
                action="Повторить"
                onAction={retry}
              />
            ) : rows.length === 0 ? (
              <StateMessage
                icon={inFavorites ? 'heart' : inQueue ? 'queue' : 'search'}
                title={
                  term
                    ? 'Совпадений нет'
                    : inQueue
                      ? 'Очередь пуста'
                      : inFavorites
                        ? 'Пока нет избранного'
                        : 'В каталоге пока нет треков'
                }
                text={
                  term
                    ? 'Попробуйте другое название или имя исполнителя.'
                    : inQueue
                      ? 'Выберите трек в каталоге, чтобы начать слушать.'
                      : inFavorites
                        ? 'Нажмите сердечко рядом с треком, чтобы сохранить его.'
                        : undefined
                }
                action={term ? 'Сбросить поиск' : inFavorites || inQueue ? 'В каталог' : undefined}
                onAction={() => (term ? setQuery('') : go('catalog'))}
              />
            ) : (
              <div className="du-list" role="list" aria-label={title}>
                <div className="du-columns" aria-hidden="true">
                  <span>#</span>
                  <span>Название</span>
                  <span>Альбом</span>
                  <Icon name="clock" size={15} />
                  <span />
                </div>
                {rows.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    variant="desktop"
                    index={index}
                    track={track}
                    isActive={track.id === current?.id}
                    status={track.id === player.pendingPlayTrackId ? 'loading' : track.id === current?.id ? player.status : 'idle'}
                    isFavorite={favorites.favoriteIds.has(track.id)}
                    favoritePending={favorites.pendingIds.has(track.id) || !favorites.canToggle}
                    onPlay={() => {
                      hapticTap();
                      player.play(track, inQueue ? player.queue : overview ? newest : tracks);
                    }}
                    onToggleFavorite={() => {
                      hapticTap();
                      void favorites.toggleFavorite(track);
                    }}
                  />
                ))}
              </div>
            )}
            {showPages && <TrackPageControls page={trackPage} language="ru" />}
          </div>
        </main>
      </div>
      <PlaybackBar
        player={player}
        onQueue={() => go(inQueue ? 'home' : 'queue')}
        queueOpen={inQueue}
        canStart={tracks.length > 0}
        onStart={start}
      />
      {(notice || auth.status === 'unavailable') && (
        <div className="du-toast" role="status">
          {notice || 'Не удалось проверить сессию.'}
          {auth.status === 'unavailable' && <button onClick={auth.retry}>Повторить</button>}
          {notice && (
            <IconButton icon="close" label="Скрыть сообщение" onClick={() => {
              auth.clearNotice();
              favorites.clearNotice();
            }} />
          )}
        </div>
      )}
      <AccountDialog
        open={auth.authOpen}
        profile={auth.profile}
        onClose={auth.closeAuth}
        onLogout={auth.logout}
        onUploadAvatar={auth.uploadAvatar}
        onCredentials={auth.acceptCredentials}
      />
    </div>
  );
}

function StateMessage({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: string;
  onAction: () => void;
}) {
  return (
    <section className="du-state">
      <Icon name={icon} size={27} />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && (
        <button className="du-pill" onClick={onAction}>
          {action}
        </button>
      )}
    </section>
  );
}
