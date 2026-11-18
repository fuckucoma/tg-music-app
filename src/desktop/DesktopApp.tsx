import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import type { Track } from '../types/track';
import { AccountDialog } from './AccountDialog';
import { Cover, Icon, IconButton, time, type IconName } from './Controls';
import FeaturedRelease from './FeaturedRelease';
import { PlaybackBar } from './PlaybackBar';
import { useDesktopLibrary } from './useDesktopLibrary';
import './desktop.css';

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

export default function DesktopApp() {
  const library = useDesktopLibrary();
  const player = usePlayer();
  const [page, setPage] = useState<Page>('home');
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const [sort, setSort] = useState('newest');
  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLElement>(null);

  const newest = useMemo(() => [...library.tracks].sort((a, b) => b.id - a.id), [library.tracks]);
  const fresh = useMemo(() => recentReleases(newest), [newest]);
  const spotlight = newest.length ? newest[focusIndex % newest.length] : null;
  const isPlaying = player.status === 'playing';
  const term = query.trim().toLocaleLowerCase();
  const overview = page === 'home' && !term;
  const inFavorites = page === 'favorites' && !term;
  const inQueue = page === 'queue' && !term;
  const current = player.currentTrack;
  const tracks = useMemo(() => {
    if (inQueue) return player.queue;
    let list = inFavorites ? library.favorites : newest;
    if (term)
      list = list.filter((t) =>
        [t.title, t.artist, t.album].some((value) => value?.toLocaleLowerCase().includes(term)),
      );
    if (!overview && sort === 'title')
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (!overview && sort === 'artist')
      return [...list].sort((a, b) => a.artist.localeCompare(b.artist, 'ru'));
    return list;
  }, [newest, library.favorites, player.queue, term, inQueue, inFavorites, sort, overview]);
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
      if (library.authOpen || event.isComposing) return;
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
  }, [library.authOpen, current, player.play, tracks]);

  useEffect(() => {
    document.title = 'UNDERLAB — Музыка';
    document.documentElement.lang = 'ru';
  }, []);

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
        {key === 'favorites' && library.authed && <small>{library.favorites.length}</small>}
      </button>
    );
  }
  const loading = inQueue ? false : inFavorites ? library.favoritesLoading : library.loading;
  const error = inQueue ? '' : inFavorites ? library.favoritesError : library.error;
  const title = term ? 'Результаты поиска' : pages[page];
  const showLogin = inFavorites && !library.authed;
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
                <Cover track={track} />
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
          <div className="du-search">
            <Icon name="search" size={18} />
            <input
              ref={search}
              type="search"
              value={query}
              aria-label="Поиск музыки"
              placeholder="Трек, исполнитель или альбом"
              onChange={(event) => {
                setQuery(event.target.value);
                scroller.current?.scrollTo({ top: 0 });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setQuery('');
                  search.current?.blur();
                }
              }}
            />
            {query ? (
              <IconButton
                icon="close"
                size={15}
                label="Очистить поиск"
                onClick={() => {
                  setQuery('');
                  search.current?.focus();
                }}
              />
            ) : (
              <kbd>Ctrl K</kbd>
            )}
          </div>
          {library.authed ? (
            <div className="du-account">
              <span className="du-avatar">{(library.userName || 'Я').slice(0, 1)}</span>
              <strong className="truncate">{library.userName || 'Аккаунт'}</strong>
              <IconButton icon="logout" size={17} label="Выйти" onClick={library.logout} />
            </div>
          ) : (
            <button type="button" className="du-login" onClick={library.openAuth}>
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
                <span className="du-count">{countTracks(tracks.length)}</span>
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
                Сортировка
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
                onAction={library.openAuth}
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
                onAction={inFavorites ? library.reloadFavorites : library.reload}
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
                {rows.map((track, i) => {
                  const active = track.id === current?.id;
                  const favorite = library.favoriteIds.has(track.id);
                  return (
                    <div
                      key={track.id}
                      role="listitem"
                      className={'du-trackrow' + (active ? ' active' : '')}
                    >
                      <button
                        className="du-trackpick"
                        onClick={() =>
                          player.play(track, inQueue ? player.queue : overview ? newest : tracks)
                        }
                        aria-label={
                          (active && isPlaying ? 'Приостановить ' : 'Слушать ') +
                          track.title +
                          ' — ' +
                          track.artist
                        }
                      >
                        <span className="du-num">
                          {active && isPlaying ? <b>♫</b> : String(i + 1).padStart(2, '0')}
                        </span>
                        <Cover track={track} />
                        <span className="min-w-0">
                          <strong className="block truncate">{track.title}</strong>
                          <small className="block truncate">{track.artist}</small>
                        </span>
                      </button>
                      <span className="du-album truncate">{track.album || '—'}</span>
                      <span className="du-duration">{track.duration ? time(track.duration) : '—'}</span>
                      <IconButton
                        icon="heart"
                        size={18}
                        className={favorite ? 'du-liked' : ''}
                        aria-pressed={favorite}
                        disabled={
                          library.pendingIds.has(track.id) ||
                          (library.authed && library.favoritesLoading)
                        }
                        label={(favorite ? 'Убрать из избранного: ' : 'В избранное: ') + track.title}
                        onClick={() => library.toggleFavorite(track)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
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
      {library.notice && (
        <div className="du-toast" role="status">
          {library.notice}
          <IconButton icon="close" label="Скрыть сообщение" onClick={library.clearNotice} />
        </div>
      )}
      <AccountDialog
        open={library.authOpen}
        onClose={library.closeAuth}
        onSuccess={library.loginSuccess}
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
