import { useId, useRef } from 'react';
import { usePlayer } from '../features/player/PlayerProvider';
import { Icon } from './Controls';

type Language = 'en' | 'ru';

const copy = {
  en: {
    devices: 'Playback devices',
    close: 'Close device list',
    here: 'This tab',
    active: 'Audio output',
    offline: 'Offline',
    switching: 'Switching audio output…',
    connecting: 'Connecting to your music session…',
    disconnected: 'Connection lost. Reconnecting…',
    select: 'Play on',
    continue: 'Continue playback here',
    dismiss: 'Dismiss playback message',
  },
  ru: {
    devices: 'Устройства воспроизведения',
    close: 'Закрыть список устройств',
    here: 'Эта вкладка',
    active: 'Вывод звука',
    offline: 'Не в сети',
    switching: 'Переключаем устройство…',
    connecting: 'Подключаем музыкальную сессию…',
    disconnected: 'Связь потеряна. Переподключаемся…',
    select: 'Воспроизводить на устройстве',
    continue: 'Продолжить воспроизведение здесь',
    dismiss: 'Скрыть сообщение плеера',
  },
};

export function PlaybackDevices({ language }: { language: Language }) {
  const player = usePlayer();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  if (player.mode === 'local') return null;

  const labels = copy[language];
  const output = player.devices.find((device) => device.id === player.activeDeviceId);
  const status = player.pendingDeviceId
    ? labels.switching
    : player.connection === 'connecting'
      ? labels.connecting
      : player.connection !== 'online'
        ? labels.disconnected
        : output?.name;

  return (
    <>
      <button
        type="button"
        className="flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-muted hover:bg-surface hover:text-text"
        aria-haspopup="dialog"
        aria-label={labels.devices}
        title={status || labels.devices}
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="devices" size={20} />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-surface text-text shadow-2xl backdrop:bg-black/70"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="p-5">
          <header className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-base font-semibold">{labels.devices}</h2>
            <button type="button" aria-label={labels.close} className="rounded-lg p-2 text-muted"
              onClick={() => dialog.current?.close()}>
              <Icon name="close" size={18} />
            </button>
          </header>
          {status && <p role="status" className="pb-3 pt-1 text-sm text-muted">{status}</p>}
          <ul className="my-2 grid gap-2">
            {player.devices.map((device) => {
              const here = device.id === player.deviceId;
              const active = device.id === player.activeDeviceId;
              return (
                <li key={device.id}>
                  <button
                    type="button"
                    aria-label={`${labels.select} ${device.name}${here ? ` (${labels.here})` : ''}`}
                    aria-pressed={active}
                    disabled={active || !device.online || Boolean(player.pendingDeviceId) || player.connection !== 'online'}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-bg p-3 text-left enabled:hover:border-muted disabled:cursor-default"
                    onClick={() => player.takeOver(device.id)}
                  >
                    <Icon name={active ? 'volume' : 'devices'} size={18} />
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-medium">{device.name}</strong>
                      {(here || active || !device.online) && (
                        <span className="block text-xs text-muted">
                          {[here && labels.here, active && labels.active, !device.online && labels.offline].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {player.needsGesture && (
            <button type="button" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg"
              onClick={player.retryPlayback}>{labels.continue}</button>
          )}
        </div>
      </dialog>
    </>
  );
}

export function PlaybackSessionNotice({ language }: { language: Language }) {
  const player = usePlayer();
  if (player.mode === 'local') return null;
  const labels = copy[language];
  const text = player.notice ?? (player.pendingDeviceId
    ? labels.switching
    : player.connection === 'offline' || player.connection === 'reconnecting'
      ? labels.disconnected
      : null);
  if (!text && !player.needsGesture) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-surface px-3 py-2 text-sm text-text">
      {text && <span role="status">{text}</span>}
      {player.needsGesture && (
        <button type="button" className="rounded-md bg-accent px-2 py-1 text-xs text-accent-fg"
          onClick={player.retryPlayback}>{labels.continue}</button>
      )}
      {player.notice && (
        <button type="button" aria-label={labels.dismiss} className="ml-auto p-1" onClick={player.clearNotice}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
