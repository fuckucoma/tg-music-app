import { useState } from 'react';
import { CredentialsForm, type AcceptCredentials, type CredentialMode } from '../features/auth/CredentialsForm';

export function LoginScreen({ onCredentials }: { onCredentials: AcceptCredentials }) {
  const [mode, setMode] = useState<CredentialMode>('login');
  const signingUp = mode === 'register';
  return (
    <div className="h-full flex flex-col items-center overflow-y-auto bg-gradient-to-b from-bg to-surface px-6 py-4">
      <div className="my-auto w-full max-w-sm shrink-0 flex flex-col gap-5 bg-surface/70 backdrop-blur-xl border border-border rounded-3xl p-6 shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
        <div className="text-center">
          <div className="relative mb-4 flex justify-center" aria-hidden="true">
            {!signingUp && <div className="absolute w-20 h-20 bg-accent/20 blur-3xl rounded-full" />}
            <div className="relative text-6xl select-none">♪</div>
          </div>
          <h1 className="text-3xl font-semibold text-text tracking-tight">
            {signingUp ? 'Create account' : 'Welcome back'}
          </h1>
          <p className="text-muted text-sm mt-1">
            {signingUp ? 'Pick a username and password' : 'Sign in to your account'}
          </p>
        </div>
        <CredentialsForm variant="mobile" mode={mode} onModeChange={setMode} onCredentials={onCredentials} />
      </div>
    </div>
  );
}
