import type { Track } from '../types/track';
import './featured.css';

interface FeaturedReleaseProps {
  track: Track | null;
  playing: boolean;
  onPlay: () => void;
  onNext: () => void;
  canNext: boolean;
  loading: boolean;
}

export default function FeaturedRelease({
  track,
  playing,
  onPlay,
  onNext,
  canNext,
  loading,
}: FeaturedReleaseProps) {
  const title = track?.title || (loading ? 'Ищем ваш звук…' : 'Музыка скоро появится');
  const artist = track?.artist || (loading ? 'Загружаем коллекцию' : 'Здесь зазвучит первый трек');

  return (
    <section className="featured-release" aria-label="В фокусе">
      <div className="featured-copy">
        <div className="featured-kicker">
          <span className="featured-live-dot" /> В ФОКУСЕ <span className="featured-kicker-rule" />
        </div>
        <div className="featured-track-info" aria-live="polite">
          <h2 title={track?.title}>{title}</h2>
          <p title={track?.artist}>{artist}</p>
        </div>
        <div className="featured-actions">
          <button
            type="button"
            className="featured-listen"
            onClick={onPlay}
            disabled={!track || loading}
            aria-label={playing ? `Пауза: ${track?.title}` : `Слушать: ${track?.title || 'трек'}`}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M8 5v14M16 5v14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m8 5 11 7-11 7z" fill="currentColor" />
              </svg>
            )}
            <span>{playing ? 'Пауза' : 'Слушать'}</span>
          </button>
          <button
            type="button"
            className="featured-next"
            onClick={onNext}
            disabled={!canNext || loading}
            aria-label="Показать следующий трек"
            title="Показать следующий трек"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h15m-6-6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="featured-art" aria-hidden="true">
        <div className="featured-art-shadow" />
        <div className="featured-case">
          <div className="featured-case-spine" />
          <div className="featured-case-inner" />
          <div className="featured-case-glint" />
          <div className="featured-case-edge" />
        </div>
        <div className="featured-disc">
          <div className="featured-disc-face">
            <div className="featured-disc-grooves" />
            <div className="featured-disc-flare" />
            <div className="featured-disc-label">
              <span>U</span>
              <i />
            </div>
          </div>
        </div>
        <div className="featured-art-spark spark-one" />
        <div className="featured-art-spark spark-two" />
      </div>
    </section>
  );
}
