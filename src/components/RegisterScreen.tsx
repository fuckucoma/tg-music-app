import { useState } from 'react';
import { BASE_URL, setToken } from '../api/tracks';

interface Props { onSuccess: () => void; onBack: () => void; }

export function RegisterScreen({ onSuccess, onBack }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async () => {
    if (!username || !password || !confirm) return;
    if (password !== confirm)  { setError('Passwords do not match'); return; }
    if (password.length < 4)   { setError('Password must be at least 4 characters'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${BASE_URL}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      setToken(data.token);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full h-12 rounded-2xl bg-surface border border-[var(--border)] px-4 text-text placeholder:text-muted text-[15px] outline-none focus:border-accent transition-colors';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">

        <div className="text-center">
          <div className="text-6xl mb-4 select-none">♪</div>
          <h1 className="text-3xl font-semibold text-text tracking-tight">Create account</h1>
          <p className="text-muted text-sm mt-1">Pick a username and password</p>
        </div>

        <div className="flex flex-col gap-3">
          <input className={inputCls} type="text"     placeholder="Username"         value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          <input className={inputCls} type="password" placeholder="Password"         value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          <input className={inputCls} type="password" placeholder="Confirm password" value={confirm}  onChange={e => setConfirm(e.target.value)}  autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>

        {error && <p className="text-danger text-sm text-center -mt-2">{error}</p>}

        <button
          className="w-full h-12 rounded-2xl bg-accent text-accent-fg font-semibold text-[15px] transition-opacity disabled:opacity-40 active:opacity-75"
          onClick={handleSubmit}
          disabled={loading || !username || !password || !confirm}
        >
          {loading
            ? <span className="inline-block w-5 h-5 border-2 border-accent-fg/30 border-t-accent-fg rounded-full animate-spin-slow" />
            : 'Create account'
          }
        </button>

        <button className="text-sm text-muted text-center" onClick={onBack}>
          Already have an account?{' '}
          <span className="text-accent font-semibold">Sign in</span>
        </button>

      </div>
    </div>
  );
}