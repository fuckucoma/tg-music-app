import { useCallback, useEffect, useState } from 'react';
import { subscribeToCatalog } from '../../services/realtime';
import { useTrackPages } from './useTrackPages';

export function useLibrary() {
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const pages = useTrackPages('', String(revision));
  useEffect(() => subscribeToCatalog(reload), [reload]);
  return { ...pages, reload, revision };
}
