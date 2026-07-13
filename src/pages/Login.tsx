import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useCustomerPath } from '../lib/customerRouting'

type LoginProps = {
  redirectTo?: string
  forgotPasswordFrom?: string
  redirectIfAuthenticated?: boolean
  useCustomerRedirect?: boolean
}

export default function Login({
  redirectTo = '/dashboard',
  forgotPasswordFrom = 'login',
  redirectIfAuthenticated = false,
  useCustomerRedirect = true,
}: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const customerPath = useCustomerPath()
  const resolvedRedirectTo =
    useCustomerRedirect && redirectTo.startsWith('/') ? customerPath(redirectTo) : redirectTo

  useEffect(() => {
    if (!redirectIfAuthenticated || !isConfigured || !supabase) return

    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate(resolvedRedirectTo, { replace: true })
    })

    return () => {
      active = false
    }
  }, [navigate, redirectIfAuthenticated, resolvedRedirectTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!isConfigured || !supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    } else {
      navigate(resolvedRedirectTo, { replace: redirectTo !== '/dashboard' })
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--deshazo-border)] bg-white p-8 shadow-[0_24px_70px_-44px_rgba(6,24,73,0.45)]">
        <h1 className="mb-1 text-2xl font-semibold text-[var(--deshazo-text)]">Welcome back</h1>
        <p className="mb-6 text-sm text-[rgba(7,18,47,0.58)]">Sign in to your account</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)]"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-[rgba(7,18,47,0.76)]">
                Password
              </label>
              <Link
                to={`${customerPath('/forgot-password')}?from=${encodeURIComponent(forgotPasswordFrom)}`}
                className="text-xs text-[var(--deshazo-blue)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[var(--deshazo-blue)] hover:bg-[var(--deshazo-blue-deep)] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[rgba(7,18,47,0.68)]">
          Don't have an account?{' '}
          <Link to={customerPath('/signup')} className="font-medium text-[var(--deshazo-blue)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
