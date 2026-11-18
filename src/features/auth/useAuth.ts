import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError, authWithTelegram, clearToken, getProfile, getToken, logout as endSession, setToken,
  uploadAvatar as saveAvatar, type Profile,
} from '../../services/api';

type Session =
  | { status: 'checking' | 'guest' | 'unavailable'; token: null; profile: null }
  | { status: 'authenticated'; token: string; profile: Profile };

const guest = { status: 'guest', token: null, profile: null } as const;
const checking = { status: 'checking', token: null, profile: null } as const;

function invalidSession(error: unknown) {
  // Older API deployments return 403 for an expired or invalid token.
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function useAuth(initData?: string) {
  const [session, setSession] = useState<Session>(checking);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const current = useRef<AbortController>();
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const clearNotice = useCallback(() => setNotice(''), []);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const verify = useCallback(async (token: string, signal: AbortSignal) => {
    const profile = await getProfile(token, signal);
    if (signal.aborted) return;
    setToken(token);
    setSession({ status: 'authenticated', token, profile });
    setNotice('');
    setAuthOpen(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    current.current = controller;
    const { signal } = controller;
    const previous = getToken();
    setSession(checking);

    async function restore() {
      if (initData) {
        try {
          const token = await authWithTelegram(initData, signal);
          await verify(token, signal);
          return;
        } catch (error) {
          if (signal.aborted) return;
          if (!previous && !invalidSession(error)) {
            setSession({ ...guest, status: 'unavailable' });
            return;
          }
        }
      }
      if (previous) {
        try {
          await verify(previous, signal);
          return;
        } catch (error) {
          if (signal.aborted) return;
          if (!invalidSession(error) && !(error instanceof ApiError && error.status === 404)) {
            setSession({ ...guest, status: 'unavailable' });
            return;
          }
          if (getToken() === previous) clearToken();
          setNotice('Сессия истекла. Войдите снова.');
        }
      }
      setSession(guest);
    }

    void restore();
    return () => current.current?.abort();
  }, [initData, attempt, verify]);

  const acceptCredentials = useCallback(async (token: string, formSignal?: AbortSignal) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const cancel = () => controller.abort();
    if (formSignal?.aborted) cancel();
    formSignal?.addEventListener('abort', cancel, { once: true });
    try {
      await verify(token, controller.signal);
    } finally {
      formSignal?.removeEventListener('abort', cancel);
    }
  }, [verify]);

  const logout = useCallback(() => {
    current.current?.abort();
    const token = getToken();
    clearToken();
    setSession(guest);
    closeAuth();
    clearNotice();
    if (token) void endSession(token).catch(() => {});
  }, [closeAuth, clearNotice]);

  const checkError = useCallback((error: unknown, token: string) => {
    if (!invalidSession(error) || getToken() !== token) return;
    clearToken();
    setSession(guest);
    setNotice('Сессия истекла. Войдите снова.');
    openAuth();
  }, [openAuth]);

  const uploadAvatar = useCallback(async (file: File) => {
    const token = session.token;
    if (!token) return;
    try {
      const profileImageUrl = await saveAvatar(token, file);
      setSession((old) => old.status === 'authenticated' && old.token === token
        ? { ...old, profile: { ...old.profile, profileImageUrl } }
        : old);
    } catch (error) {
      checkError(error, token);
      throw error;
    }
  }, [session.token, checkError]);

  return {
    ...session, authOpen, notice, openAuth, closeAuth, clearNotice, retry, acceptCredentials,
    logout, checkError, uploadAvatar,
  };
}
