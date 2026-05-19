import { useState } from "react"
import { login } from "../api/tracks"
import { RegisterScreen } from "./RegisterScreen"

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [showRegister, setShowRegister] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (showRegister) {
    return (
      <RegisterScreen
        onSuccess={onSuccess}
        onBack={() => setShowRegister(false)}
      />
    )
  }

  const handleSubmit = async () => {
    if (!username || !password) return
    setLoading(true)
    setError("")

    try {
      await login(username, password)
      onSuccess()
    } catch (e: any) {
      setError(e.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background text-foreground">
      
      <div className="w-full max-w-sm space-y-4 bg-card p-6 rounded-2xl shadow-lg border">
        
        {/* Icon */}
        <div className="text-4xl text-center">♪</div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center">
          Sign in
        </h2>

        <p className="text-sm text-muted-foreground text-center">
          Enter your credentials
        </p>

        {/* Inputs */}
        <input
          className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary"
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />

        <input
          className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500 text-center">
            {error}
          </p>
        )}

        {/* Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !username || !password}
          className="w-full h-12 rounded-xl bg-red-500 text-primary-foreground font-semibold flex items-center justify-center disabled:opacity-40"
        >
          {loading ? "..." : "Sign in"}
        </button>

        {/* Switch */}
        <button
          onClick={() => setShowRegister(true)}
          className="text-sm text-center text-muted-foreground"
        >
          No account?{" "}
          <span className="text-primary font-semibold">
            Create one
          </span>
        </button>

      </div>
    </div>
  )
}