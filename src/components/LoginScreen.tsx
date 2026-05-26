import { useState } from 'react';
import { login } from '../api/tracks';
import { RegisterScreen } from './RegisterScreen';

interface Props { onSuccess: () => void; }

export function LoginScreen({ onSuccess }: Props) {
  const [showRegister, setShowRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (showRegister) {
    return <RegisterScreen onSuccess={onSuccess} onBack={() => setShowRegister(false)} />;
  }

  const handleSubmit = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Logo */}
        <div className="text-center">
          <div className="text-6xl mb-4 select-none">♪</div>
          <h1 className="text-3xl font-semibold text-text tracking-tight">Welcome back</h1>
          <p className="text-muted text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-3">
          <input
            className="w-full h-12 rounded-2xl bg-surface border border-[var(--border)] px-4 text-text placeholder:text-muted text-[15px] outline-none focus:border-accent transition-colors"
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
          <input
            className="w-full h-12 rounded-2xl bg-surface border border-[var(--border)] px-4 text-text placeholder:text-muted text-[15px] outline-none focus:border-accent transition-colors"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="text-danger text-sm text-center -mt-2">{error}</p>
        )}

        {/* Submit */}
        <button
          className="w-full h-12 hover:opacity-80 duration-200 rounded-2xl bg-accent text-accent-fg font-semibold text-[15px] transition-opacity disabled:opacity-40 active:opacity-75"
          onClick={handleSubmit}
          disabled={loading || !username || !password}
        >
          {loading
            ? <span className="inline-block w-5 h-5 border-2 border-accent-fg/30 border-t-accent-fg rounded-full animate-spin-slow" />
            : 'Sign in'
          }
        </button>

        {/* Switch */}
        <button
          className="text-sm text-muted text-center hover:opacity-80 duration-200 transition-opacity"
          onClick={() => setShowRegister(true)}
        >
          No account?{' '}
          <span className="text-accent font-semibold">Create one</span>
        </button>

      </div>
    </div>
  );
}