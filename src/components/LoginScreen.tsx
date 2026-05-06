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
    return (
      <RegisterScreen
        onSuccess={onSuccess}
        onBack={() => setShowRegister(false)}
      />
    );
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
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon">♪</div>
        <h2>Sign in</h2>
        <p className="login-sub">Enter your credentials</p>

        <input
          className="login-input"
          type="text"
          placeholder="Username"
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

        <button className="auth-switch-btn" onClick={() => setShowRegister(true)}>
          No account? <span>Create one</span>
        </button>
      </div>
    </div>
  );
}