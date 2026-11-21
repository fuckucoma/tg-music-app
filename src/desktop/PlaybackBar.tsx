import { useRef, type CSSProperties } from 'react';
import { usePlayerProgress, type usePlayer } from '../features/player/PlayerProvider';
import { PlaybackDevices, PlaybackSessionNotice } from '../components/PlaybackDevices';
import { Cover, Icon, IconButton, time } from './Controls';
import './playback.css';

type Props = {
  player: ReturnType<typeof usePlayer>;
  onQueue: () => void;
  queueOpen: boolean;
  onStart: () => void;
  canStart: boolean;
};

export function PlaybackBar({ player, onQueue, queueOpen, onStart, canStart }: Props) {
  const previousVolume = useRef(player.volume > 0 ? player.volume : 1);
  const hasTrack = !!player.currentTrack;
  const remoteAudio = player.mode === 'remote' && Boolean(player.activeDeviceId);
  const outputName = remoteAudio
    ? player.devices.find((device) => device.id === player.activeDeviceId)?.name
    : undefined;
  const progress = usePlayerProgress();
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const toggleMute = () => {
    if (player.volume > 0) {
      previousVolume.current = player.volume;
      player.changeVolume(0);
    } else player.changeVolume(previousVolume.current || 1);
  };
  const repeatLabel =
    player.repeat === 'one'
      ? 'Повтор одного трека'
      : player.repeat === 'all'
        ? 'Повтор очереди'
        : 'Повтор выключен';
  const waitingForPlay = player.pendingPlayTrackId !== null &&
    (!player.currentTrack || player.pendingPlayTrackId === player.currentTrack.id);
  const playLabel = waitingForPlay ? 'Ожидание воспроизведения' : player.status === 'playing' ? 'Пауза' : 'Воспроизвести';
  return (
    <section className="du-player" aria-label="Плеер">
      <div className="du-now">
        <PlaybackDevices language="ru" />
        <Cover track={player.currentTrack} className="du-now-cover" />
        <div className="du-now-text">
          <strong title={player.currentTrack?.title}>
            {player.currentTrack?.title || 'Ничего не играет'}
          </strong>
          <span title={player.currentTrack?.artist}>
            {player.currentTrack?.artist || 'Выберите трек'}
          </span>
          {outputName && <span title={outputName}>Звук на {outputName}</span>}
        </div>
      </div>
      <div className="du-transport">
        <PlaybackSessionNotice language="ru" />
        <div className="du-transport-buttons">
          <IconButton
            icon="shuffle"
            label="Перемешать"
            className={player.shuffle ? 'is-active' : ''}
            aria-pressed={player.shuffle}
            onClick={player.toggleShuffle}
            disabled={!hasTrack}
          />
          <IconButton
            icon="prev"
            label="Предыдущий трек"
            onClick={player.playPrev}
            disabled={!hasTrack}
          />
          <button
            type="button"
            className="du-play"
            aria-label={playLabel}
            aria-busy={waitingForPlay || undefined}
            title={playLabel}
            disabled={!hasTrack && !canStart}
            onClick={() => (player.currentTrack ? player.play(player.currentTrack) : onStart())}
          >
            {waitingForPlay
              ? <span aria-hidden="true" className="h-5 w-5 animate-spin-slow rounded-full border-2 border-current border-t-transparent" />
              : <Icon name={player.status === 'playing' ? 'pause' : 'play'} size={19} />}
          </button>
          <IconButton
            icon="next"
            label="Следующий трек"
            onClick={() => player.playNext()}
            disabled={!hasTrack}
          />
          <span className="du-repeat-wrap">
            <IconButton
              icon="repeat"
              label={repeatLabel}
              className={player.repeat !== 'none' ? 'is-active' : ''}
              aria-pressed={player.repeat !== 'none'}
              onClick={player.cycleRepeat}
              disabled={!hasTrack}
            />
            {player.repeat === 'one' && (
              <span aria-hidden="true" className="du-repeat-one">
                1
              </span>
            )}
          </span>
        </div>
        <div className="du-timeline">
          <span>{time(progress * duration)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={progress}
            disabled={!hasTrack || !duration}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Позиция воспроизведения"
            aria-valuetext={`${time(progress * duration)} из ${time(duration)}`}
            style={{ '--fill': `${progress * 100}%` } as CSSProperties}
          />
          <span>{time(duration)}</span>
        </div>
        {player.mode === 'local' && player.status === 'error' && (
          <span className="du-playback-error" role="alert">
            Не удалось воспроизвести трек
          </span>
        )}
      </div>
      <div className="du-volume">
        <IconButton
          icon="queue"
          label={queueOpen ? 'Закрыть очередь' : 'Открыть очередь'}
          aria-pressed={queueOpen}
          className={queueOpen ? 'is-active' : ''}
          onClick={onQueue}
        />
        <IconButton
          icon={player.volume === 0 ? 'mute' : 'volume'}
          label={player.volume === 0 ? 'Включить звук' : 'Выключить звук'}
          disabled={remoteAudio}
          onClick={toggleMute}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={player.volume}
          disabled={remoteAudio}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (value > 0) previousVolume.current = value;
            player.changeVolume(value);
          }}
          aria-label="Громкость"
          aria-valuetext={`${Math.round(player.volume * 100)}%`}
          style={{ '--fill': `${player.volume * 100}%` } as CSSProperties}
        />
      </div>
    </section>
  );
}
