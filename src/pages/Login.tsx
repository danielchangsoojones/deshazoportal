import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useCustomerPath } from '../lib/customerRouting'
import Signup from './Signup'

type LoginProps = {
  redirectTo?: string
  forgotPasswordFrom?: string
  redirectIfAuthenticated?: boolean
  useCustomerRedirect?: boolean
  showSignup?: boolean
}

export default function Login({
  redirectTo = '/dashboard',
  forgotPasswordFrom = 'login',
  redirectIfAuthenticated = false,
  useCustomerRedirect = true,
  showSignup = true,
}: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendingConfirmation, setResendingConfirmation] = useState(false)
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
    setConfirmationMessage('')
    setEmailConfirmationRequired(false)
    setLoading(true)

    if (!isConfigured || !supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
      setLoading(false)
      return
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

      if (error) {
        const isEmailNotConfirmed =
          error.code === 'email_not_confirmed' || error.message.trim().toLowerCase() === 'email not confirmed'

        if (isEmailNotConfirmed) {
          setEmailConfirmationRequired(true)
          setError('Your email address hasn’t been confirmed yet. Please open the confirmation link sent to your registered email address, then try signing in again. Check your spam folder if you can’t find it.')
        } else if (error.message.toLowerCase() === 'invalid login credentials') {
          setError('We couldn’t sign you in with those details. Check your email and password, or use “Forgot password?” to reset your password. If you recently signed up, confirm your email first.')
        } else {
          setError(error.message)
        }
      } else {
        navigate(resolvedRedirectTo, { replace: redirectTo !== '/dashboard' })
      }
    } catch {
      setError('Unable to sign in right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const resendConfirmation = async () => {
    if (!supabase || !emailConfirmationRequired || resendingConfirmation) return

    setError('')
    setConfirmationMessage('')
    setResendingConfirmation(true)

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}${customerPath('/login')}` },
      })

      if (error) setError(error.message)
      else setConfirmationMessage('If this account still needs confirmation, a new link has been sent. Check your inbox and spam folder.')
    } catch {
      setError('Unable to resend the confirmation email right now. Please try again.')
    } finally {
      setResendingConfirmation(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col justify-center bg-[var(--bg)] px-4 py-8 sm:px-6 lg:py-12">
      <div className={`mx-auto w-full ${showSignup ? 'max-w-6xl' : 'max-w-md'}`}>
        <div className={showSignup ? 'flex flex-col gap-10 sm:gap-12' : ''}>
        {showSignup && (
          <p className="text-base leading-7 text-[rgba(7,18,47,0.58)] sm:text-lg">
            Sign in to continue, or create your account if this is your first visit.
          </p>
        )}
        <div className={`grid items-start gap-5 ${showSignup ? 'lg:grid-cols-2 lg:gap-7' : ''}`}>
        <section className="w-full rounded-2xl border border-[var(--deshazo-border)] border-t-[8px] border-t-[var(--deshazo-blue-soft)] bg-white p-8 shadow-[0_24px_70px_-44px_rgba(6,24,73,0.45)]">
        {showSignup && <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--deshazo-blue-soft)]">Returning user</p>}
        <h1 style={{ fontSize: '2.5rem', lineHeight: 1.1, margin: 0 }} className="mb-1 font-semibold text-[var(--deshazo-text)]">Sign in</h1>
        <p className="mb-6 text-base text-[rgba(7,18,47,0.58)]">Welcome back. Pick up where you left off.</p>

        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        {confirmationMessage && (
          <div role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {confirmationMessage}
          </div>
        )}
        {emailConfirmationRequired && (
          <button
            type="button"
            onClick={() => void resendConfirmation()}
            disabled={resendingConfirmation}
            className="mb-4 w-full rounded-lg border border-[var(--deshazo-border)] px-4 py-2.5 text-sm font-medium text-[var(--deshazo-blue)] transition-colors hover:bg-[var(--deshazo-surface)] disabled:opacity-50"
          >
            {resendingConfirmation ? 'Sending…' : 'Resend confirmation email'}
          </button>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Email
            </label>
            <input
              id="login-email"
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
              <label htmlFor="login-password" className="block text-sm font-medium text-[rgba(7,18,47,0.76)]">
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
              id="login-password"
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

        </section>
        {showSignup && <Signup embedded />}
        </div>
        </div>
      </div>
    </main>
  )
}
