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
  const activeToken = useRef<string | null>(null);
  const accountChange = useRef<{ token: string | null } | null>(null);
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const clearNotice = useCallback(() => setNotice(''), []);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const verify = useCallback(async (token: string, signal: AbortSignal, storedAtStart?: string | null) => {
    const profile = await getProfile(token, signal);
    if (signal.aborted) return;
    activeToken.current = token;
    if (storedAtStart === undefined || getToken() === storedAtStart) setToken(token);
    setSession({ status: 'authenticated', token, profile });
    setNotice('');
    setAuthOpen(false);
  }, []);

  useEffect(() => {
    accountChange.current = null;
    activeToken.current = null;
    const controller = new AbortController();
    current.current = controller;
    const { signal } = controller;
    const previous = getToken();
    setSession(checking);

    async function restore() {
      if (initData) {
        try {
          const token = await authWithTelegram(initData, signal);
          await verify(token, signal, previous);
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
          await verify(previous, signal, previous);
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
    return () => {
      accountChange.current = null;
      current.current?.abort();
    };
  }, [initData, attempt, verify]);

  const verifyCredentials = useCallback(async (token: string, formSignal?: AbortSignal) => {
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

  const acceptCredentials = useCallback((token: string, formSignal?: AbortSignal) => {
    accountChange.current = null;
    return verifyCredentials(token, formSignal);
  }, [verifyCredentials]);

  const changeAccount = useCallback(async (requestToken: () => Promise<string>) => {
    if (accountChange.current) throw new Error('Another account change is in progress');
    const change = { token: activeToken.current };
    accountChange.current = change;
    try {
      const token = await requestToken();
      if (accountChange.current === change && activeToken.current === change.token) {
        await verifyCredentials(token);
      }
    } finally {
      if (accountChange.current === change) accountChange.current = null;
    }
  }, [verifyCredentials]);

  const logout = useCallback(() => {
    accountChange.current = null;
    current.current?.abort();
    const token = activeToken.current;
    activeToken.current = null;
    if (token && getToken() === token) clearToken();
    setSession(guest);
    closeAuth();
    clearNotice();
    if (token) void endSession(token).catch(() => {});
  }, [closeAuth, clearNotice]);

  const checkError = useCallback((error: unknown, token: string) => {
    // The confirmed merge may revoke the old Telegram login before its replacement arrives.
    if (!invalidSession(error) || activeToken.current !== token || accountChange.current?.token === token) return;
    activeToken.current = null;
    if (getToken() === token) clearToken();
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

  const refreshProfile = useCallback(async (signal?: AbortSignal) => {
    const token = session.token;
    if (!token) return null;
    try {
      const profile = await getProfile(token, signal);
      if (signal?.aborted || activeToken.current !== token) return null;
      setSession((old) => old.status === 'authenticated' && old.token === token ? { ...old, profile } : old);
      return profile;
    } catch (error) {
      if (!signal?.aborted) checkError(error, token);
      throw error;
    }
  }, [session.token, checkError]);

  return {
    ...session, authOpen, notice, openAuth, closeAuth, clearNotice, retry, acceptCredentials,
    logout, checkError, uploadAvatar, refreshProfile, changeAccount,
  };
}
