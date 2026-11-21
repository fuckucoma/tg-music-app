import { createContext, useContext, type ReactNode } from 'react';
import { useTelegram } from '../../platform/telegram/useTelegram';
import { useAuth } from './useAuth';

type Account = ReturnType<typeof useAuth> & ReturnType<typeof useTelegram>;
const AccountContext = createContext<Account | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const platform = useTelegram();
  const auth = useAuth(platform.initData);
  return (
    <AccountContext.Provider value={{ ...auth, ...platform }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount requires AuthProvider');
  return account;
}
