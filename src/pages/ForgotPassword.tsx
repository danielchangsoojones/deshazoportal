import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useCustomerPath } from '../lib/customerRouting'

export default function ForgotPassword() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const customerPath = useCustomerPath()
  const backToLoginPath = searchParams.get('from') === 'quote' ? '/quotelogin' : customerPath('/login')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!isConfigured || !supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
      return
    }

    try {
      setLoading(true)
      const redirectTo = `${window.location.origin}${customerPath('/reset-password')}`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })

      if (error) {
        setError(error.message)
      } else {
        setMessage('Password reset link sent. Check your email.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--deshazo-border)] bg-white p-8 shadow-[0_24px_70px_-44px_rgba(6,24,73,0.45)]">
        <h1 className="text-2xl font-semibold text-[var(--deshazo-text)] mb-1">Forgot password</h1>
        <p className="mb-6 text-sm text-[rgba(7,18,47,0.68)]">
          Enter your email and we&apos;ll send you a reset link
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {message}
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--deshazo-blue)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--deshazo-blue-deep)] disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[rgba(7,18,47,0.68)]">
          <Link to={backToLoginPath} className="font-medium text-[var(--deshazo-blue)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
