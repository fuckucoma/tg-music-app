import { useState } from 'react';
import { login } from '../api/tracks';

interface Props { onSuccess: () => void; }

export function LoginScreen({ onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon">♪</div>
        <h2>Sign in</h2>
        <p className="login-sub">Enter your credentials</p>

        <input
          className="login-input"
          type="text"
          placeholder="Username"         {/* ← was "Email" */}
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
        />
        <input
          className="login-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoComplete="current-password"
        />

        {error && <p className="login-error">{error}</p>}

        <button
          className="login-btn"
          onClick={handleSubmit}
          disabled={loading || !username || !password}
        >
          {loading ? <span className="btn-spinner" /> : 'Sign in'}
        </button>
      </div>
    </div>
  );
}