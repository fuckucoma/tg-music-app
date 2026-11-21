export function createPlaybackProgress() {
  const listeners = new Set<() => void>();
  let progress = 0;
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get: () => progress,
    set(value: number) {
      if (value === progress) return;
      progress = value;
      for (const listener of listeners) listener();
    },
  };
}
