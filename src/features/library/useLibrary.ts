import { useCallback, useEffect, useState } from 'react';
import { getTracks } from '../../services/api';
import { subscribeToCatalog } from '../../services/realtime';
import type { Track } from '../../types/track';

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getTracks(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setTracks(result); })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить треки.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => subscribeToCatalog(reload), [reload]);
  return { tracks, loading, error, reload, revision };
}
