import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useCustomerPath } from '../lib/customerRouting'

export default function ResetPassword() {
  const configError = !isConfigured || !supabase
    ? 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local'
    : ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(configError)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()
  const customerPath = useCustomerPath()

  useEffect(() => {
    if (configError || !supabase) {
      return
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setError(error.message)
      } else if (data.session) {
        setSessionReady(true)
      } else {
        setError('Open this page from the password reset link in your email.')
      }
    })
  }, [configError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully. Redirecting to sign in...')
      setTimeout(() => {
        navigate(customerPath('/login'))
      }, 1200)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--deshazo-border)] bg-white p-8 shadow-[0_24px_70px_-44px_rgba(6,24,73,0.45)]">
        <h1
          className="mb-1 text-2xl font-semibold"
          style={{ color: 'var(--deshazo-blue)' }}
        >
          Reset password
        </h1>
        <p className="mb-6 text-sm text-[rgba(7,18,47,0.68)]">Choose a new password for your portal account</p>

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
              New password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={!sessionReady || loading}
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)] disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[rgba(7,18,47,0.76)]">
              Confirm new password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={!sessionReady || loading}
              className="w-full rounded-lg border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm text-[var(--deshazo-text)] placeholder:text-[rgba(7,18,47,0.38)] focus:outline-none focus:ring-2 focus:border-[var(--deshazo-blue)] focus:ring-[rgba(6,24,73,0.16)] disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={!sessionReady || loading}
            className="w-full py-2.5 px-4 bg-[var(--deshazo-blue)] hover:bg-[var(--deshazo-blue-deep)] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[rgba(7,18,47,0.68)]">
          <Link to={customerPath('/login')} className="font-medium text-[var(--deshazo-blue)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
