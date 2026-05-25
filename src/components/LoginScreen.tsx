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
  <div className="min-h-screen flex items-center justify-center bg-black px-4">
    
    <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
      
      {/* Logo */}
      <div className="text-center mb-3">
        <div className="text-5xl mb-">♪</div>

        <h1 className="text-3xl font-bold  text-white">
          Sign in
        </h1>

        <p className="text-zinc-400 mt-1">
          Enter your credentials
        </p>
      </div>

      {/* Inputs */}
      <div className="space-y-3">

        <input
          className="w-full h-10 rounded-xl bg-zinc-800 border border-zinc-700 px-4 text-white placeholder:text-zinc-500 outline-none focus:border-white transition"
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
        />

        <input
          className="w-full h-10 rounded-xl bg-zinc-800 border border-zinc-700 px-4 text-white placeholder:text-zinc-500 outline-none focus:border-white transition"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoComplete="current-password"
        />

      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm text-center mt-3">
          {error}
        </p>
      )}

      {/* Button */}
      <button
        className="w-full h-10 rounded-xl bg-white text-black font-semibold mt-4 transition hover:opacity-90 disabled:opacity-40"
        onClick={handleSubmit}
        disabled={loading || !username || !password}
      >
        {loading ? 'Loading...' : 'Sign in'}
      </button>

      {/* Switch */}
      <button
        className="w-full text-sm text-zinc-400 mt-4"
        onClick={() => setShowRegister(true)}
      >
        No account?{" "}
        <span className="text-white font-semibold">
          Create one
        </span>
      </button>

    </div>

  </div>
)

}