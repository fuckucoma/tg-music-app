import { useState } from 'react';
import { BASE_URL, setToken } from '../api/tracks';

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

export function RegisterScreen({ onSuccess, onBack }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username || !password || !confirm) return;
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/users/register`, {
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

  return (
  <div className="min-h-screen flex items-center justify-center bg-black px-4">

    <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">

      {/* Logo */}
      <div className="text-center mb-6">

        <div className="text-5xl mb-3">♪</div>

        <h1 className="text-3xl font-bold text-white">
          Create account
        </h1>

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
          autoComplete="new-password"
        />

        <input
          className="w-full h-10   rounded-xl bg-zinc-800 border border-zinc-700 px-4 text-white placeholder:text-zinc-500 outline-none focus:border-white transition"
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoComplete="new-password"
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
        className="w-full h-12 rounded-xl bg-white text-black font-semibold mt-4 transition hover:opacity-90 disabled:opacity-40"
        onClick={handleSubmit}
        disabled={
          loading ||
          !username ||
          !password ||
          !confirm
        }
      >
        {loading ? 'Loading...' : 'Create account'}
      </button>

      {/* Back */}
      <button
        className="w-full text-sm text-zinc-400 mt-4"
        onClick={onBack}
      >
        Already have an account?{" "}
        <span className="text-white font-semibold">
          Sign in
        </span>
      </button>

    </div>

  </div>
)
}